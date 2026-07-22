"""Sentinel AI - Autonomous Production Intelligence Platform
Main FastAPI application with all routes for the enterprise observability platform.
"""
import os
import uuid
import asyncio
import json
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Any, Dict

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from auth import (
    hash_password, verify_password, create_access_token, decode_token,
    get_current_user, require_roles,
    ROLE_ADMIN, ROLE_SRE, ROLE_DEVELOPER, ROLE_VIEWER, ALL_ROLES,
)
from simulator import SIM, sim_loop, _now_iso
from notifications import deliver as deliver_notification

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Sentinel AI", version="1.0.0")
api = APIRouter(prefix="/api")

logger = logging.getLogger("sentinel")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


# ============================================================
#                          MODELS
# ============================================================
class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    user: Dict[str, Any]


class ChatRequest(BaseModel):
    session_id: str
    message: str
    context: Optional[Dict[str, Any]] = None


class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    role: str  # user | assistant | system
    content: str
    created_at: str = Field(default_factory=_now_iso)


class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    full_name: str
    role: str  # ADMIN | SRE | DEVELOPER | VIEWER


class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None


class ThresholdUpdate(BaseModel):
    key: str
    value: float


class AiSettingsUpdate(BaseModel):
    model: Optional[str] = None
    temperature: Optional[float] = None
    auto_rca: Optional[bool] = None
    auto_notify: Optional[bool] = None
    confidence_threshold: Optional[float] = None


class AlertRuleCreate(BaseModel):
    name: str
    metric: str
    op: str
    threshold: float
    window_min: int
    severity: str
    enabled: bool = True


class ChannelUpsert(BaseModel):
    type: str
    target: str
    enabled: bool = True
    config: Optional[Dict[str, Any]] = None  # provider-specific: webhook_url, api_key, from_email


class ChannelPatch(BaseModel):
    target: Optional[str] = None
    enabled: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None


class AlertRulePatch(BaseModel):
    name: Optional[str] = None
    metric: Optional[str] = None
    op: Optional[str] = None
    threshold: Optional[float] = None
    window_min: Optional[int] = None
    severity: Optional[str] = None
    enabled: Optional[bool] = None


class TestChannelRequest(BaseModel):
    subject: Optional[str] = "Sentinel AI · test notification"
    body: Optional[str] = "This is a test message from Sentinel AI. If you can read this, the delivery channel is wired up correctly."
    severity: Optional[str] = "P3"


# ============================================================
#                       STARTUP & SEED
# ============================================================
SEED_USERS = [
    {"username": "admin", "password": "admin123", "email": "admin@sentinel.ai", "full_name": "System Admin", "role": ROLE_ADMIN},
    {"username": "sre", "password": "sre123", "email": "sre@sentinel.ai", "full_name": "Priya Sharma", "role": ROLE_SRE},
    {"username": "developer", "password": "dev123", "email": "dev@sentinel.ai", "full_name": "Marco Rossi", "role": ROLE_DEVELOPER},
    {"username": "viewer", "password": "viewer123", "email": "viewer@sentinel.ai", "full_name": "Chen Wei", "role": ROLE_VIEWER},
]


async def seed_users():
    for u in SEED_USERS:
        existing = await db.users.find_one({"username": u["username"]})
        if existing:
            # ensure password hash is up to date (idempotent)
            await db.users.update_one(
                {"username": u["username"]},
                {"$set": {
                    "password_hash": hash_password(u["password"]),
                    "email": u["email"],
                    "full_name": u["full_name"],
                    "role": u["role"],
                    "active": True,
                }},
            )
        else:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "username": u["username"],
                "password_hash": hash_password(u["password"]),
                "email": u["email"],
                "full_name": u["full_name"],
                "role": u["role"],
                "active": True,
                "created_at": _now_iso(),
                "last_login": None,
            })


async def seed_channels_and_rules():
    """Idempotently seed default notification channels and alert rules into Mongo."""
    if await db.channels.count_documents({}) == 0:
        for c in SIM.channels:
            await db.channels.insert_one({**c, "config": {}, "created_at": _now_iso()})
    if await db.alert_rules.count_documents({}) == 0:
        for r in SIM.alert_rules:
            await db.alert_rules.insert_one({**r, "created_at": _now_iso()})


@app.on_event("startup")
async def on_startup():
    SIM.initialize()
    await seed_users()
    await seed_channels_and_rules()
    asyncio.create_task(sim_loop())
    logger.info("Sentinel AI backend initialized. Users seeded, simulator running.")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


# ============================================================
#                          AUTH ROUTES
# ============================================================
@api.post("/auth/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    user = await db.users.find_one({"username": req.username}, {"_id": 0})
    if not user or not user.get("active"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": user["username"], "role": user["role"], "uid": user["id"]})
    await db.users.update_one({"username": req.username}, {"$set": {"last_login": _now_iso()}})
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "actor": user["username"], "action": "login",
        "target": user["username"], "timestamp": _now_iso(), "ip": "-", "details": None,
    })
    user_pub = {k: v for k, v in user.items() if k != "password_hash"}
    return LoginResponse(token=token, user=user_pub)


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"username": user["sub"]}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return u


# ============================================================
#                     DASHBOARD / OVERVIEW
# ============================================================
def _health_score() -> int:
    healthy = sum(1 for s in SIM.services if s["status"] == "healthy")
    total = len(SIM.services)
    return round((healthy / total) * 100) if total else 0


@api.get("/dashboard/overview")
async def dashboard_overview(_: dict = Depends(get_current_user)):
    healthy = sum(1 for s in SIM.services if s["status"] == "healthy")
    degraded = sum(1 for s in SIM.services if s["status"] == "degraded")
    down = sum(1 for s in SIM.services if s["status"] == "down")
    total_rps = round(sum(s["rps"] for s in SIM.services), 1)
    avg_p99 = round(sum(s["latency_p99"] for s in SIM.services) / len(SIM.services), 1)
    avg_err = round(sum(s["error_rate"] for s in SIM.services) / len(SIM.services), 2)
    active_incidents = sum(1 for i in SIM.incidents if i["status"] in ("open", "investigating", "mitigated"))
    kafka_lag_total = sum(t["lag"] for t in SIM.kafka_topics)
    resolved = [i for i in SIM.incidents if i["mttr_minutes"] is not None]
    mttr = round(sum(i["mttr_minutes"] for i in resolved) / len(resolved), 1) if resolved else 0
    return {
        "health_score": _health_score(),
        "services": {"healthy": healthy, "degraded": degraded, "down": down, "total": len(SIM.services)},
        "throughput_rps": total_rps,
        "latency_p99_ms": avg_p99,
        "error_rate_pct": avg_err,
        "active_incidents": active_incidents,
        "kafka_lag_total": kafka_lag_total,
        "mttr_minutes": mttr,
        "ai_confidence": round(SIM.ai_settings["confidence_threshold"] + 0.15, 2),
        "timeseries": SIM.timeseries,
    }


# ============================================================
#                         SERVICES
# ============================================================
@api.get("/services")
async def list_services(_: dict = Depends(get_current_user)):
    return SIM.services


@api.get("/services/{service_id}")
async def get_service(service_id: str, _: dict = Depends(get_current_user)):
    svc = next((s for s in SIM.services if s["id"] == service_id), None)
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    return svc


# ============================================================
#                         INCIDENTS
# ============================================================
@api.get("/incidents")
async def list_incidents(status: Optional[str] = None, _: dict = Depends(get_current_user)):
    items = SIM.incidents
    if status:
        items = [i for i in items if i["status"] == status]
    return sorted(items, key=lambda x: x["opened_at"], reverse=True)


@api.get("/incidents/{incident_id}")
async def get_incident(incident_id: str, _: dict = Depends(get_current_user)):
    inc = next((i for i in SIM.incidents if i["id"] == incident_id), None)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    # correlated events
    inc["correlated_events"] = _correlated_events(inc)
    inc["timeline"] = _incident_timeline(inc)
    return inc


def _correlated_events(inc: Dict[str, Any]) -> List[Dict[str, Any]]:
    svc = inc["service"]
    events = []
    # find deploy near incident
    deploy = next((d for d in SIM.deployments if d["service"] == svc), None)
    if deploy:
        events.append({"type": "deployment", "at": deploy["deployed_at"], "summary": f"{deploy['service']} {deploy['version']} · {deploy['commit_message']}", "severity": deploy["risk_level"]})
    # kafka
    hot_topic = max(SIM.kafka_topics, key=lambda t: t["lag"])
    events.append({"type": "kafka_lag", "at": _now_iso(), "summary": f"{hot_topic['name']} lag {hot_topic['lag']} messages", "severity": "high" if hot_topic["lag"] > 5000 else "medium"})
    # k8s
    crash = next((p for p in SIM.pods if p["status"] == "CrashLoopBackOff"), None)
    if crash:
        events.append({"type": "k8s_event", "at": _now_iso(), "summary": f"Pod {crash['name']} entered CrashLoopBackOff", "severity": "critical"})
    # db
    hot_db = max(SIM.databases, key=lambda d: d["connections_active"] / d["connections_max"])
    events.append({"type": "database", "at": _now_iso(), "summary": f"{hot_db['name']} using {hot_db['connections_active']}/{hot_db['connections_max']} connections", "severity": "high" if hot_db["connections_active"] > 0.9 * hot_db["connections_max"] else "medium"})
    return events


def _incident_timeline(inc: Dict[str, Any]) -> List[Dict[str, Any]]:
    opened = datetime.fromisoformat(inc["opened_at"])
    steps = [
        {"at": (opened - timedelta(minutes=22)).isoformat(), "type": "deployment", "title": "Deployment", "detail": f"{inc['service']} deployed with 8 file changes"},
        {"at": (opened - timedelta(minutes=14)).isoformat(), "type": "kafka", "title": "Kafka lag rising", "detail": "orders.created consumer lag crossed 3.2k"},
        {"at": (opened - timedelta(minutes=6)).isoformat(), "type": "db", "title": "DB pressure", "detail": "Connection pool utilization at 92%"},
        {"at": inc["opened_at"], "type": "alert", "title": "AI Anomaly Detected", "detail": f"Confidence {inc['ai_confidence']} - {inc['title']}"},
        {"at": (opened + timedelta(minutes=8)).isoformat(), "type": "notification", "title": "Notifications sent", "detail": "Slack #prod-alerts, Email SRE on-call, Teams War Room"},
    ]
    if inc["status"] in ("mitigated", "resolved"):
        steps.append({"at": (opened + timedelta(minutes=25)).isoformat(), "type": "mitigation", "title": "Mitigation applied", "detail": "Traffic rerouted to healthy pods; auto-scaler scaled HPA to 8"})
    if inc["status"] == "resolved" and inc["resolved_at"]:
        steps.append({"at": inc["resolved_at"], "type": "resolution", "title": "Incident resolved", "detail": f"MTTR {inc['mttr_minutes']} min"})
    return steps


# ============================================================
#                          KAFKA
# ============================================================
@api.get("/kafka/topics")
async def kafka_topics(_: dict = Depends(get_current_user)):
    return SIM.kafka_topics


@api.get("/kafka/summary")
async def kafka_summary(_: dict = Depends(get_current_user)):
    total_lag = sum(t["lag"] for t in SIM.kafka_topics)
    total_throughput = round(sum(t["throughput_msg_s"] for t in SIM.kafka_topics), 1)
    total_dlq = sum(t["dlq_count"] for t in SIM.kafka_topics)
    at_risk = [t for t in SIM.kafka_topics if t["ai_prediction"] in ("at_risk", "degrading")]
    return {
        "topics_count": len(SIM.kafka_topics),
        "total_lag": total_lag,
        "throughput_msg_s": total_throughput,
        "dlq_count": total_dlq,
        "at_risk_topics": len(at_risk),
        "at_risk_names": [t["name"] for t in at_risk],
    }


# ============================================================
#                       KUBERNETES
# ============================================================
@api.get("/k8s/pods")
async def k8s_pods(namespace: Optional[str] = None, _: dict = Depends(get_current_user)):
    pods = SIM.pods
    if namespace:
        pods = [p for p in pods if p["namespace"] == namespace]
    return pods


@api.get("/k8s/summary")
async def k8s_summary(_: dict = Depends(get_current_user)):
    running = sum(1 for p in SIM.pods if p["status"] == "Running")
    crashloop = sum(1 for p in SIM.pods if p["status"] == "CrashLoopBackOff")
    pending = sum(1 for p in SIM.pods if p["status"] == "Pending")
    high_cpu = [p for p in SIM.pods if p["cpu_pct"] > 80]
    return {
        "total": len(SIM.pods), "running": running, "crashloop": crashloop, "pending": pending,
        "avg_cpu": round(sum(p["cpu_pct"] for p in SIM.pods) / len(SIM.pods), 1),
        "avg_memory": round(sum(p["memory_pct"] for p in SIM.pods) / len(SIM.pods), 1),
        "high_cpu_pods": len(high_cpu),
        "namespaces": ["production", "staging", "kafka", "monitoring"],
    }


# ============================================================
#                       DATABASE
# ============================================================
@api.get("/database/instances")
async def db_instances(_: dict = Depends(get_current_user)):
    return SIM.databases


@api.get("/database/slow-queries")
async def slow_queries(_: dict = Depends(get_current_user)):
    return sorted(SIM.slow_queries, key=lambda q: q["avg_ms"], reverse=True)


@api.get("/database/summary")
async def db_summary(_: dict = Depends(get_current_user)):
    conn_usage = [d["connections_active"] / d["connections_max"] for d in SIM.databases]
    return {
        "instances": len(SIM.databases),
        "avg_connection_pct": round(sum(conn_usage) / len(conn_usage) * 100, 1),
        "slow_queries_count": len(SIM.slow_queries),
        "estimated_savings_pct": round(sum(q["estimated_gain_pct"] for q in SIM.slow_queries) / len(SIM.slow_queries), 1),
        "avg_cache_hit": round(sum(d["cache_hit_ratio"] for d in SIM.databases) / len(SIM.databases), 2),
    }


# ============================================================
#                       DEPLOYMENTS
# ============================================================
@api.get("/deployments")
async def deployments(_: dict = Depends(get_current_user)):
    return sorted(SIM.deployments, key=lambda d: d["deployed_at"], reverse=True)


@api.get("/deployments/{deployment_id}")
async def deployment_detail(deployment_id: str, _: dict = Depends(get_current_user)):
    dep = next((d for d in SIM.deployments if d["id"] == deployment_id), None)
    if not dep:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return dep


# ============================================================
#                      DISTRIBUTED TRACING
# ============================================================
@api.get("/traces")
async def list_traces(_: dict = Depends(get_current_user)):
    return sorted(SIM.traces, key=lambda t: t["started_at"], reverse=True)


@api.get("/traces/{trace_id}")
async def get_trace(trace_id: str, _: dict = Depends(get_current_user)):
    tr = next((t for t in SIM.traces if t["id"] == trace_id), None)
    if not tr:
        raise HTTPException(status_code=404, detail="Trace not found")
    # find bottleneck span
    bottleneck = max(tr["spans"], key=lambda s: s["duration_ms"])
    tr["bottleneck_span_id"] = bottleneck["id"]
    return tr


# ============================================================
#                      NOTIFICATIONS
# ============================================================
def _sanitize_channel(ch: Dict[str, Any]) -> Dict[str, Any]:
    """Mask secret config values before returning to clients."""
    out = {k: v for k, v in ch.items() if k != "_id"}
    cfg = out.get("config") or {}
    masked = {}
    for k, v in cfg.items():
        if not v:
            masked[k] = v
        elif k in ("api_key", "webhook_url"):
            s = str(v)
            masked[k] = s[:6] + "…" + s[-4:] if len(s) > 12 else "•••"
        else:
            masked[k] = v
    out["config"] = masked
    out["configured"] = bool(cfg)
    return out


@api.get("/notifications/channels")
async def get_channels(_: dict = Depends(get_current_user)):
    docs = await db.channels.find({}, {"_id": 0}).to_list(200)
    return [_sanitize_channel(c) for c in docs]


@api.post("/notifications/channels")
async def upsert_channel(payload: ChannelUpsert, user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_SRE))):
    ch = {
        "id": str(uuid.uuid4()),
        "type": payload.type,
        "target": payload.target,
        "enabled": payload.enabled,
        "verified": True,
        "config": payload.config or {},
        "created_at": _now_iso(),
    }
    await db.channels.insert_one(ch)
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "actor": user["sub"], "action": "create_channel",
        "target": payload.type, "timestamp": _now_iso(), "ip": "-",
        "details": {"target": payload.target},
    })
    ch.pop("_id", None)
    return _sanitize_channel(ch)


@api.patch("/notifications/channels/{channel_id}")
async def patch_channel(channel_id: str, payload: ChannelPatch, user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_SRE))):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "config" in update:
        # merge — do not overwrite unrelated keys
        existing = await db.channels.find_one({"id": channel_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Channel not found")
        merged = {**(existing.get("config") or {}), **update["config"]}
        update["config"] = {k: v for k, v in merged.items() if v not in (None, "")}
    result = await db.channels.update_one({"id": channel_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Channel not found")
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "actor": user["sub"], "action": "update_channel",
        "target": channel_id, "timestamp": _now_iso(), "ip": "-",
        "details": {k: ("***" if k == "config" else v) for k, v in update.items()},
    })
    return {"ok": True}


@api.delete("/notifications/channels/{channel_id}")
async def delete_channel(channel_id: str, user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_SRE))):
    result = await db.channels.delete_one({"id": channel_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Channel not found")
    return {"ok": True}


@api.post("/notifications/channels/{channel_id}/test")
async def test_channel(channel_id: str, payload: TestChannelRequest, user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_SRE))):
    ch = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    result = await deliver_notification(ch, payload.subject, payload.body, payload.severity)
    # persist history
    hist = {
        "id": str(uuid.uuid4()),
        "channel_id": channel_id,
        "channel": ch["type"],
        "target": ch.get("target"),
        "subject": payload.subject,
        "sent_at": _now_iso(),
        "delivered": result["delivered"],
        "mocked": result["mocked"],
        "detail": result["detail"],
        "triggered_by": user["sub"],
        "kind": "test",
    }
    await db.notification_history.insert_one(hist)
    hist.pop("_id", None)
    return hist


@api.get("/notifications/alert-rules")
async def get_alert_rules(_: dict = Depends(get_current_user)):
    return await db.alert_rules.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.post("/notifications/alert-rules")
async def create_alert_rule(payload: AlertRuleCreate, user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_SRE))):
    rule = {"id": str(uuid.uuid4()), **payload.model_dump(), "created_at": _now_iso()}
    await db.alert_rules.insert_one(rule)
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "actor": user["sub"], "action": "create_alert_rule",
        "target": rule["name"], "timestamp": _now_iso(), "ip": "-",
        "details": {"metric": rule["metric"], "threshold": rule["threshold"]},
    })
    rule.pop("_id", None)
    return rule


@api.patch("/notifications/alert-rules/{rule_id}")
async def patch_alert_rule(rule_id: str, payload: AlertRulePatch, user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_SRE))):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.alert_rules.update_one({"id": rule_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"ok": True}


@api.delete("/notifications/alert-rules/{rule_id}")
async def delete_alert_rule(rule_id: str, user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_SRE))):
    result = await db.alert_rules.delete_one({"id": rule_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "actor": user["sub"], "action": "delete_alert_rule",
        "target": rule_id, "timestamp": _now_iso(), "ip": "-", "details": None,
    })
    return {"ok": True}


@api.post("/notifications/alert-rules/{rule_id}/trigger")
async def trigger_alert_rule(rule_id: str, user: dict = Depends(require_roles(ROLE_ADMIN, ROLE_SRE))):
    """Fire this alert rule NOW through every enabled channel. Returns per-channel delivery result."""
    rule = await db.alert_rules.find_one({"id": rule_id}, {"_id": 0})
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    channels = await db.channels.find({"enabled": True}, {"_id": 0}).to_list(50)
    subject = f"[{rule['severity']}] {rule['name']}"
    body = (
        f"Alert rule fired manually by {user['sub']}\n"
        f"Metric: {rule['metric']} {rule['op']} {rule['threshold']}\n"
        f"Window: {rule['window_min']}m · Severity: {rule['severity']}\n"
        f"Grounded in current telemetry — investigate immediately."
    )
    results = []
    for ch in channels:
        r = await deliver_notification(ch, subject, body, rule["severity"])
        hist = {
            "id": str(uuid.uuid4()),
            "channel_id": ch["id"], "channel": ch["type"], "target": ch.get("target"),
            "subject": subject, "sent_at": _now_iso(),
            "delivered": r["delivered"], "mocked": r["mocked"], "detail": r["detail"],
            "triggered_by": user["sub"], "kind": "rule_trigger", "rule_id": rule_id,
        }
        await db.notification_history.insert_one(hist)
        hist.pop("_id", None)
        results.append(hist)
    return {"rule": rule["name"], "results": results}


@api.get("/notifications/history")
async def notification_history(limit: int = 50, _: dict = Depends(get_current_user)):
    real = await db.notification_history.find({}, {"_id": 0}).sort("sent_at", -1).to_list(limit)
    if real:
        return real
    # bootstrap synthetic history so the UI never looks empty
    channels_map = {"email": "sre-oncall@sentinel.ai", "slack": "#prod-alerts", "teams": "SRE War Room"}
    seeded = []
    for i in range(12):
        ch = list(channels_map.keys())[i % 3]
        seeded.append({
            "id": str(uuid.uuid4()),
            "channel": ch,
            "target": channels_map[ch],
            "subject": f"[{'P1' if i % 4 == 0 else 'P2'}] Incident: {SIM.incidents[i % len(SIM.incidents)]['title']}",
            "sent_at": (datetime.now(timezone.utc) - timedelta(minutes=i * 17)).isoformat(),
            "delivered": True, "mocked": True, "detail": "seed",
            "triggered_by": "system", "kind": "seed",
        })
    return seeded


# ============================================================
#                          ADMIN
# ============================================================
@api.get("/admin/users")
async def list_users(_: dict = Depends(require_roles(ROLE_ADMIN))):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return users


@api.post("/admin/users")
async def create_user(payload: UserCreate, actor: dict = Depends(require_roles(ROLE_ADMIN))):
    if payload.role not in ALL_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    exists = await db.users.find_one({"username": payload.username})
    if exists:
        raise HTTPException(status_code=409, detail="Username already exists")
    doc = {
        "id": str(uuid.uuid4()),
        "username": payload.username,
        "email": payload.email,
        "full_name": payload.full_name,
        "role": payload.role,
        "password_hash": hash_password(payload.password),
        "active": True,
        "created_at": _now_iso(),
        "last_login": None,
    }
    await db.users.insert_one(doc)
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "actor": actor["sub"], "action": "create_user",
        "target": payload.username, "timestamp": _now_iso(), "ip": "-",
        "details": {"role": payload.role},
    })
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc


@api.patch("/admin/users/{username}")
async def update_user(username: str, payload: UserUpdate, actor: dict = Depends(require_roles(ROLE_ADMIN))):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.users.update_one({"username": username}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "actor": actor["sub"], "action": "update_user",
        "target": username, "timestamp": _now_iso(), "ip": "-", "details": update,
    })
    return {"ok": True}


@api.delete("/admin/users/{username}")
async def delete_user(username: str, actor: dict = Depends(require_roles(ROLE_ADMIN))):
    if username == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete primary admin")
    result = await db.users.delete_one({"username": username})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "actor": actor["sub"], "action": "delete_user",
        "target": username, "timestamp": _now_iso(), "ip": "-", "details": None,
    })
    return {"ok": True}


@api.get("/admin/thresholds")
async def get_thresholds(_: dict = Depends(require_roles(ROLE_ADMIN, ROLE_SRE))):
    return SIM.thresholds


@api.patch("/admin/thresholds")
async def update_threshold(payload: ThresholdUpdate, actor: dict = Depends(require_roles(ROLE_ADMIN, ROLE_SRE))):
    if payload.key not in SIM.thresholds:
        raise HTTPException(status_code=400, detail="Unknown threshold key")
    SIM.thresholds[payload.key] = payload.value
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "actor": actor["sub"], "action": "update_threshold",
        "target": payload.key, "timestamp": _now_iso(), "ip": "-",
        "details": {"value": payload.value},
    })
    return SIM.thresholds


@api.get("/admin/ai-settings")
async def get_ai_settings(_: dict = Depends(require_roles(ROLE_ADMIN, ROLE_SRE))):
    return SIM.ai_settings


@api.patch("/admin/ai-settings")
async def update_ai_settings(payload: AiSettingsUpdate, actor: dict = Depends(require_roles(ROLE_ADMIN, ROLE_SRE))):
    for k, v in payload.model_dump().items():
        if v is not None:
            SIM.ai_settings[k] = v
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()), "actor": actor["sub"], "action": "update_ai_settings",
        "target": "ai", "timestamp": _now_iso(), "ip": "-", "details": SIM.ai_settings,
    })
    return SIM.ai_settings


@api.get("/admin/audit-log")
async def get_audit_log(_: dict = Depends(require_roles(ROLE_ADMIN))):
    logs = await db.audit_log.find({}, {"_id": 0}).sort("timestamp", -1).to_list(200)
    return logs


# ============================================================
#                    AI COPILOT / RCA
# ============================================================
def _build_context_snippet() -> str:
    ov_health = _health_score()
    active = [i for i in SIM.incidents if i["status"] in ("open", "investigating", "mitigated")]
    top_incident = active[0] if active else None
    hot_topic = max(SIM.kafka_topics, key=lambda t: t["lag"])
    crash_pods = [p for p in SIM.pods if p["status"] == "CrashLoopBackOff"]
    hot_db = max(SIM.databases, key=lambda d: d["connections_active"] / d["connections_max"])
    slow_q = max(SIM.slow_queries, key=lambda q: q["avg_ms"])
    recent_deploy = max(SIM.deployments, key=lambda d: d["deployed_at"])
    unhealthy = [s["name"] for s in SIM.services if s["status"] != "healthy"]
    lines = [
        f"Platform health score: {ov_health}%",
        f"Unhealthy services: {', '.join(unhealthy) if unhealthy else 'none'}",
        f"Active incidents: {len(active)}",
    ]
    if top_incident:
        lines.append(f"Top incident: [{top_incident['severity']}] {top_incident['title']} · service={top_incident['service']} · status={top_incident['status']}")
    lines.append(f"Kafka hottest topic: {hot_topic['name']} lag={hot_topic['lag']} dlq={hot_topic['dlq_count']}")
    if crash_pods:
        lines.append(f"CrashLoopBackOff pods: {', '.join(p['name'] for p in crash_pods[:3])}")
    lines.append(f"DB pressure: {hot_db['name']} conn {hot_db['connections_active']}/{hot_db['connections_max']}")
    lines.append(f"Slowest query: {slow_q['query'][:80]}... avg={slow_q['avg_ms']}ms")
    lines.append(f"Latest deploy: {recent_deploy['service']} {recent_deploy['version']} risk={recent_deploy['risk_level']} ({recent_deploy['commit_message']})")
    return "\n".join(lines)


def _system_prompt() -> str:
    return (
        "You are Sentinel AI Copilot, an expert SRE and production incident intelligence assistant "
        "at a Fortune-500 fintech/e-commerce company. You respond in a concise, technical, executive-friendly tone. "
        "Structure responses with short paragraphs, bullet points, and clear headings when useful. "
        "Ground every answer in the live telemetry snippet you receive. If asked for a fix or RCA, give: "
        "(1) Root cause hypothesis with confidence, (2) Correlated signals, (3) Recommended immediate action, "
        "(4) Preventive follow-up. Never invent services or metrics not present in the context. "
        "Use monospace code fences for commands, queries, or configuration snippets. "
        "Avoid emojis. Assume the operator is on-call and needs speed."
    )


async def _stream_llm(session_id: str, user_message: str, extra_context: Optional[Dict[str, Any]] = None):
    """Stream response tokens from Claude via emergentintegrations."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

    telemetry = _build_context_snippet()
    ctx_text = f"[LIVE TELEMETRY]\n{telemetry}"
    if extra_context:
        ctx_text += f"\n\n[USER-PROVIDED CONTEXT]\n{extra_context}"

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=_system_prompt() + "\n\n" + ctx_text,
    ).with_model("anthropic", SIM.ai_settings.get("model", "claude-sonnet-4-5-20250929"))

    # persist user message
    await db.chat_messages.insert_one({
        "id": str(uuid.uuid4()), "session_id": session_id, "role": "user",
        "content": user_message, "created_at": _now_iso(),
    })

    async def gen():
        buf = []
        try:
            async for ev in chat.stream_message(UserMessage(text=user_message)):
                if isinstance(ev, TextDelta):
                    buf.append(ev.content)
                    # SSE-style token stream
                    yield f"data: {ev.content}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:
            err = f"[error] {str(e)}"
            buf.append(err)
            yield f"data: {err}\n\n"
        # persist assistant message
        try:
            await db.chat_messages.insert_one({
                "id": str(uuid.uuid4()), "session_id": session_id, "role": "assistant",
                "content": "".join(buf), "created_at": _now_iso(),
            })
        except Exception:
            pass
        yield "data: [DONE]\n\n"

    return gen()


@api.post("/copilot/chat/stream")
async def copilot_chat_stream(req: ChatRequest, _: dict = Depends(get_current_user)):
    gen = await _stream_llm(req.session_id, req.message, req.context)
    return StreamingResponse(
        gen,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@api.post("/copilot/chat")
async def copilot_chat_sync(req: ChatRequest, _: dict = Depends(get_current_user)):
    """Non-streaming version for simpler UIs and testing."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    telemetry = _build_context_snippet()
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=req.session_id,
        system_message=_system_prompt() + "\n\n[LIVE TELEMETRY]\n" + telemetry,
    ).with_model("anthropic", SIM.ai_settings.get("model", "claude-sonnet-4-5-20250929"))

    await db.chat_messages.insert_one({
        "id": str(uuid.uuid4()), "session_id": req.session_id, "role": "user",
        "content": req.message, "created_at": _now_iso(),
    })
    try:
        response = await chat.send_message(UserMessage(text=req.message))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
    await db.chat_messages.insert_one({
        "id": str(uuid.uuid4()), "session_id": req.session_id, "role": "assistant",
        "content": response, "created_at": _now_iso(),
    })
    return {"response": response}


@api.get("/copilot/history/{session_id}")
async def copilot_history(session_id: str, _: dict = Depends(get_current_user)):
    msgs = await db.chat_messages.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return msgs


@api.post("/copilot/rca/{incident_id}")
async def generate_rca(incident_id: str, _: dict = Depends(get_current_user)):
    inc = next((i for i in SIM.incidents if i["id"] == incident_id), None)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    from emergentintegrations.llm.chat import LlmChat, UserMessage

    telemetry = _build_context_snippet()
    correlated = _correlated_events(inc)
    prompt = (
        f"Perform Root Cause Analysis for incident:\n"
        f"- Title: {inc['title']}\n- Severity: {inc['severity']}\n- Service: {inc['service']}\n"
        f"- AI confidence: {inc['ai_confidence']}\n- Impact: {inc['impact']}\n\n"
        f"Correlated events:\n{correlated}\n\n"
        f"Return: 1) Root cause hypothesis with confidence % 2) Evidence chain "
        f"3) Recommended immediate mitigation 4) Preventive follow-up. Keep it under 350 words."
    )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"rca-{incident_id}",
        system_message=_system_prompt() + "\n\n[LIVE TELEMETRY]\n" + telemetry,
    ).with_model("anthropic", SIM.ai_settings.get("model", "claude-sonnet-4-5-20250929"))
    try:
        response = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
    inc["root_cause"] = response
    return {"root_cause": response, "correlated_events": correlated}


@api.post("/copilot/deployment-risk/{deployment_id}")
async def deployment_risk_ai(deployment_id: str, _: dict = Depends(get_current_user)):
    dep = next((d for d in SIM.deployments if d["id"] == deployment_id), None)
    if not dep:
        raise HTTPException(status_code=404, detail="Deployment not found")

    from emergentintegrations.llm.chat import LlmChat, UserMessage

    prompt = (
        f"Analyze deployment risk:\n"
        f"- Service: {dep['service']} → {dep['version']}\n"
        f"- Commit: {dep['commit_sha']} — {dep['commit_message']}\n"
        f"- Author: {dep['author']}\n"
        f"- Files changed: {dep['files_changed']}, +{dep['lines_added']} / -{dep['lines_removed']}\n"
        f"- Current risk score: {dep['risk_score']} ({dep['risk_level']})\n\n"
        f"Return a concise pre-deployment risk analysis: rationale, blast radius, "
        f"top 3 things to watch after deploy, rollback strategy. Under 220 words."
    )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"deploy-risk-{deployment_id}",
        system_message=_system_prompt(),
    ).with_model("anthropic", SIM.ai_settings.get("model", "claude-sonnet-4-5-20250929"))
    try:
        response = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
    dep["ai_summary"] = response
    return {"ai_summary": response}


# ============================================================
#                    LIVE WEBSOCKET
# ============================================================
def _live_snapshot() -> Dict[str, Any]:
    """Snapshot of live overview data for websocket clients."""
    healthy = sum(1 for s in SIM.services if s["status"] == "healthy")
    degraded = sum(1 for s in SIM.services if s["status"] == "degraded")
    down = sum(1 for s in SIM.services if s["status"] == "down")
    total_rps = round(sum(s["rps"] for s in SIM.services), 1)
    avg_p99 = round(sum(s["latency_p99"] for s in SIM.services) / len(SIM.services), 1)
    avg_err = round(sum(s["error_rate"] for s in SIM.services) / len(SIM.services), 2)
    active_incidents = sum(1 for i in SIM.incidents if i["status"] in ("open", "investigating", "mitigated"))
    kafka_lag_total = sum(t["lag"] for t in SIM.kafka_topics)
    resolved = [i for i in SIM.incidents if i["mttr_minutes"] is not None]
    mttr = round(sum(i["mttr_minutes"] for i in resolved) / len(resolved), 1) if resolved else 0
    health_score = round((healthy / len(SIM.services)) * 100) if SIM.services else 0
    return {
        "ts": _now_iso(),
        "health_score": health_score,
        "services": {"healthy": healthy, "degraded": degraded, "down": down, "total": len(SIM.services)},
        "throughput_rps": total_rps,
        "latency_p99_ms": avg_p99,
        "error_rate_pct": avg_err,
        "active_incidents": active_incidents,
        "kafka_lag_total": kafka_lag_total,
        "mttr_minutes": mttr,
        "ai_confidence": round(SIM.ai_settings["confidence_threshold"] + 0.15, 2),
        "latest": {
            "latency": SIM.timeseries["latency"][-1] if SIM.timeseries["latency"] else None,
            "error_rate": SIM.timeseries["error_rate"][-1] if SIM.timeseries["error_rate"] else None,
            "throughput": SIM.timeseries["throughput"][-1] if SIM.timeseries["throughput"] else None,
            "cpu": SIM.timeseries["cpu"][-1] if SIM.timeseries["cpu"] else None,
            "memory": SIM.timeseries["memory"][-1] if SIM.timeseries["memory"] else None,
        },
    }


@app.websocket("/api/ws/live")
async def ws_live(ws: WebSocket, token: Optional[str] = Query(None)):
    """Live telemetry over WebSocket. Auth via ?token=<jwt>."""
    payload = decode_token(token) if token else None
    if not payload:
        await ws.close(code=1008)
        return
    await ws.accept()
    try:
        # send full initial timeseries so the client can prime charts
        await ws.send_json({
            "kind": "init",
            "snapshot": _live_snapshot(),
            "timeseries": SIM.timeseries,
        })
        while True:
            await asyncio.sleep(3)
            await ws.send_json({"kind": "tick", "snapshot": _live_snapshot()})
    except WebSocketDisconnect:
        return
    except Exception as e:
        logger.warning(f"ws_live error: {e}")
        try:
            await ws.close()
        except Exception:
            pass


# ============================================================
#                        HEALTH
# ============================================================
@api.get("/")
async def root():
    return {"service": "Sentinel AI", "status": "operational", "version": "1.0.0"}


@api.get("/health")
async def health():
    return {"status": "healthy", "timestamp": _now_iso(), "simulator": SIM._initialized}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
