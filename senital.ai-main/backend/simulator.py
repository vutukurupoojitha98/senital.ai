"""Realistic in-memory + Mongo-backed simulation state for Sentinel AI.
Generates live-feeling monitoring data (services, kafka, k8s, db, traces, incidents,
deployments, alerts) that mutates over time via a background task.
"""
import asyncio
import random
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any

# ---------------------- static seed data ----------------------
SERVICE_NAMES = [
    ("checkout-service", "checkout"),
    ("payment-gateway", "payment"),
    ("user-service", "identity"),
    ("cart-service", "commerce"),
    ("inventory-service", "commerce"),
    ("notification-service", "messaging"),
    ("fraud-detector", "risk"),
    ("recommendation-engine", "ml"),
    ("order-orchestrator", "commerce"),
    ("shipping-service", "logistics"),
    ("auth-service", "identity"),
    ("analytics-ingest", "data"),
]

ENVIRONMENTS = ["production", "staging", "dev"]

KAFKA_TOPICS = [
    "orders.created", "orders.fulfilled", "payments.processed", "payments.failed",
    "users.signup", "cart.updated", "inventory.reserved", "notifications.email",
    "fraud.scored", "shipping.dispatched",
]

DB_INSTANCES = [
    ("prod-postgres-01", "primary", "us-east-1"),
    ("prod-postgres-02", "replica", "us-east-1"),
    ("prod-postgres-03", "replica", "us-west-2"),
    ("analytics-warehouse", "primary", "us-east-1"),
]

K8S_NAMESPACES = ["production", "staging", "kafka", "monitoring"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now() -> datetime:
    return datetime.now(timezone.utc)


class SimState:
    def __init__(self):
        self.services: List[Dict[str, Any]] = []
        self.kafka_topics: List[Dict[str, Any]] = []
        self.pods: List[Dict[str, Any]] = []
        self.databases: List[Dict[str, Any]] = []
        self.slow_queries: List[Dict[str, Any]] = []
        self.incidents: List[Dict[str, Any]] = []
        self.deployments: List[Dict[str, Any]] = []
        self.traces: List[Dict[str, Any]] = []
        self.notifications: List[Dict[str, Any]] = []
        self.audit_log: List[Dict[str, Any]] = []
        self.timeseries: Dict[str, List[Dict[str, Any]]] = {
            "latency": [], "error_rate": [], "throughput": [], "cpu": [], "memory": [],
        }
        self.alert_rules: List[Dict[str, Any]] = []
        self.channels: List[Dict[str, Any]] = []
        self.thresholds: Dict[str, float] = {
            "latency_p99_ms": 800,
            "error_rate_pct": 2.5,
            "kafka_lag": 5000,
            "cpu_pct": 85,
            "memory_pct": 90,
        }
        self.ai_settings: Dict[str, Any] = {
            "model": "claude-sonnet-4-5-20250929",
            "temperature": 0.3,
            "auto_rca": True,
            "auto_notify": True,
            "confidence_threshold": 0.75,
        }
        self._initialized = False

    def initialize(self):
        if self._initialized:
            return
        # services
        for name, domain in SERVICE_NAMES:
            status = random.choices(["healthy", "degraded", "down"], weights=[85, 12, 3])[0]
            self.services.append({
                "id": str(uuid.uuid4()),
                "name": name,
                "domain": domain,
                "environment": "production",
                "version": f"v{random.randint(2, 5)}.{random.randint(0, 20)}.{random.randint(0, 9)}",
                "status": status,
                "instances": random.randint(2, 8),
                "rps": round(random.uniform(50, 3000), 1),
                "latency_p50": random.randint(20, 120),
                "latency_p95": random.randint(150, 400),
                "latency_p99": random.randint(300, 900),
                "error_rate": round(random.uniform(0.05, 3.5), 2),
                "cpu": round(random.uniform(15, 75), 1),
                "memory": round(random.uniform(30, 82), 1),
                "uptime_pct": round(random.uniform(99.5, 99.999), 3),
                "language": random.choice(["Java 17 / Spring Boot", "Java 17 / Spring Boot", "Java 17 / Spring Boot", "Kotlin / Ktor"]),
                "last_deploy": (_now() - timedelta(hours=random.randint(1, 72))).isoformat(),
            })
        # kafka topics
        for t in KAFKA_TOPICS:
            self.kafka_topics.append({
                "id": str(uuid.uuid4()),
                "name": t,
                "partitions": random.choice([3, 6, 12]),
                "replication": 3,
                "consumer_groups": random.randint(1, 4),
                "lag": random.randint(0, 8000),
                "throughput_msg_s": round(random.uniform(50, 4000), 1),
                "dlq_count": random.randint(0, 250),
                "retry_count": random.randint(0, 400),
                "failed_events": random.randint(0, 40),
                "ai_prediction": random.choices(["stable", "at_risk", "degrading"], weights=[75, 20, 5])[0],
                "ai_confidence": round(random.uniform(0.72, 0.98), 2),
            })
        # k8s pods
        for i, (svc, _) in enumerate(SERVICE_NAMES):
            for j in range(random.randint(2, 5)):
                restart_count = random.choices([0, 1, 3, 12], weights=[80, 12, 6, 2])[0]
                pod_status = "Running"
                if restart_count > 8:
                    pod_status = "CrashLoopBackOff"
                elif random.random() < 0.03:
                    pod_status = "Pending"
                self.pods.append({
                    "id": str(uuid.uuid4()),
                    "name": f"{svc}-{random.choice(['7d8f4c', '5b8a2d', 'ab34fe'])}-{random.choice(['xk2p9', 'qr7t3', 'wm4nk'])}",
                    "namespace": "production",
                    "service": svc,
                    "status": pod_status,
                    "ready": pod_status == "Running",
                    "restarts": restart_count,
                    "cpu_pct": round(random.uniform(5, 88), 1),
                    "memory_pct": round(random.uniform(20, 91), 1),
                    "node": f"ip-10-0-{random.randint(1, 30)}-{random.randint(1, 250)}",
                    "age_hours": random.randint(1, 720),
                    "hpa": {"min": 2, "max": 10, "current": random.randint(2, 8), "target_cpu": 70},
                })
        # databases
        for name, role, region in DB_INSTANCES:
            self.databases.append({
                "id": str(uuid.uuid4()),
                "name": name,
                "role": role,
                "region": region,
                "engine": "PostgreSQL 15.4",
                "connections_active": random.randint(20, 180),
                "connections_max": 200,
                "cpu": round(random.uniform(20, 78), 1),
                "memory": round(random.uniform(35, 85), 1),
                "iops": random.randint(500, 8000),
                "replication_lag_ms": random.randint(0, 250) if role == "replica" else 0,
                "cache_hit_ratio": round(random.uniform(94.0, 99.8), 2),
                "status": random.choices(["healthy", "degraded"], weights=[92, 8])[0],
            })
        self.slow_queries = self._gen_slow_queries()
        self.deployments = self._gen_deployments()
        self.incidents = self._gen_incidents()
        self.traces = self._gen_traces()
        self.alert_rules = self._gen_alert_rules()
        self.channels = [
            {"id": str(uuid.uuid4()), "type": "email", "target": "sre-oncall@sentinel.ai", "enabled": True, "verified": True},
            {"id": str(uuid.uuid4()), "type": "slack", "target": "#prod-alerts", "enabled": True, "verified": True},
            {"id": str(uuid.uuid4()), "type": "teams", "target": "SRE War Room", "enabled": True, "verified": True},
            {"id": str(uuid.uuid4()), "type": "pagerduty", "target": "primary-oncall", "enabled": False, "verified": False},
        ]
        # timeseries seed (last 60 points)
        base_ts = _now() - timedelta(minutes=60)
        for i in range(60):
            ts = (base_ts + timedelta(minutes=i)).isoformat()
            self.timeseries["latency"].append({"t": ts, "p50": random.randint(40, 90), "p95": random.randint(180, 320), "p99": random.randint(320, 700)})
            self.timeseries["error_rate"].append({"t": ts, "v": round(random.uniform(0.2, 2.8), 2)})
            self.timeseries["throughput"].append({"t": ts, "v": random.randint(4000, 12000)})
            self.timeseries["cpu"].append({"t": ts, "v": round(random.uniform(30, 70), 1)})
            self.timeseries["memory"].append({"t": ts, "v": round(random.uniform(45, 80), 1)})
        self._initialized = True

    def _gen_slow_queries(self):
        samples = [
            ("SELECT * FROM orders WHERE user_id = $1 AND status IN ('pending','processing') ORDER BY created_at DESC", "orders", 2380, "Missing composite index on (user_id, status, created_at). Add index to reduce cost by ~87%."),
            ("SELECT COUNT(*) FROM audit_log WHERE tenant_id = $1 AND action = $2", "audit_log", 1840, "Table scan on 42M rows. Recommend BRIN index on tenant_id."),
            ("UPDATE inventory SET reserved = reserved + $1 WHERE sku = $2", "inventory", 920, "Lock contention detected. Consider SKIP LOCKED pattern or Redis-backed reservation."),
            ("SELECT o.*, u.email FROM orders o JOIN users u ON o.user_id=u.id WHERE o.total > $1", "orders", 3120, "Nested loop join on unindexed range. Use hash join hint or add (total) index."),
            ("SELECT * FROM payment_events WHERE created_at > now() - interval '7 days'", "payment_events", 1560, "Partition by created_at (weekly) to prune 96% of rows."),
            ("SELECT DISTINCT sku FROM cart_items WHERE session_id = $1", "cart_items", 640, "Use EXISTS instead of DISTINCT for 4x speed-up."),
        ]
        return [{
            "id": str(uuid.uuid4()),
            "query": q,
            "table": t,
            "avg_ms": ms,
            "calls_per_min": random.randint(20, 3200),
            "total_time_pct": round(random.uniform(2.5, 24.0), 1),
            "recommendation": rec,
            "estimated_gain_pct": random.randint(30, 92),
            "first_seen": (_now() - timedelta(days=random.randint(1, 30))).isoformat(),
        } for (q, t, ms, rec) in samples]

    def _gen_deployments(self):
        authors = ["alice.chen", "raj.patel", "maria.gomez", "kenji.tanaka", "emma.rossi", "david.okonkwo"]
        deployments = []
        for i in range(14):
            svc = random.choice(SERVICE_NAMES)[0]
            risk = random.choices(["low", "medium", "high", "critical"], weights=[50, 30, 15, 5])[0]
            files = random.randint(2, 48)
            deployments.append({
                "id": str(uuid.uuid4()),
                "service": svc,
                "version": f"v{random.randint(2, 5)}.{random.randint(0, 20)}.{random.randint(0, 9)}",
                "commit_sha": uuid.uuid4().hex[:7],
                "commit_message": random.choice([
                    "feat: add idempotency key for payment retries",
                    "fix: null pointer in user preference cache",
                    "refactor: extract order state machine",
                    "perf: batch inventory reservations",
                    "chore: bump spring-boot to 3.2.1",
                    "feat: enable circuit breaker on downstream calls",
                    "fix: race condition in cart merge",
                ]),
                "author": random.choice(authors),
                "files_changed": files,
                "lines_added": random.randint(files * 3, files * 60),
                "lines_removed": random.randint(files, files * 40),
                "risk_score": {"low": 18, "medium": 46, "high": 74, "critical": 91}[risk] + random.randint(-6, 6),
                "risk_level": risk,
                "environment": "production",
                "deployed_at": (_now() - timedelta(hours=i * 4 + random.randint(0, 3))).isoformat(),
                "status": random.choices(["succeeded", "rolled_back"], weights=[92, 8])[0],
                "ai_summary": None,  # populated on demand
            })
        return deployments

    def _gen_incidents(self):
        titles = [
            ("P1", "Checkout failure spike after payment-gateway v3.4.2 deploy", "checkout-service"),
            ("P2", "Kafka consumer lag exceeding threshold on orders.created", "order-orchestrator"),
            ("P3", "Elevated p99 latency on user-service", "user-service"),
            ("P1", "Database connection pool exhaustion on prod-postgres-01", "checkout-service"),
            ("P2", "CrashLoopBackOff on inventory-service pods", "inventory-service"),
            ("P3", "Increased 5xx from recommendation-engine", "recommendation-engine"),
        ]
        incidents = []
        for i, (sev, title, svc) in enumerate(titles):
            state = random.choices(["open", "investigating", "mitigated", "resolved"], weights=[15, 20, 25, 40])[0]
            opened = _now() - timedelta(hours=random.randint(1, 72))
            incidents.append({
                "id": str(uuid.uuid4()),
                "severity": sev,
                "title": title,
                "service": svc,
                "status": state,
                "opened_at": opened.isoformat(),
                "detected_by": "ai_anomaly_detector",
                "ai_confidence": round(random.uniform(0.78, 0.97), 2),
                "impact": random.choice(["12% of checkout traffic", "3.4k users affected", "Payment latency +180%", "Order fulfillment stalled"]),
                "resolved_at": (opened + timedelta(minutes=random.randint(15, 240))).isoformat() if state == "resolved" else None,
                "mttr_minutes": random.randint(12, 180) if state == "resolved" else None,
                "root_cause": None,  # populated on demand
                "correlated_events": [],
                "recommended_fix": None,
            })
        return incidents

    def _gen_traces(self):
        traces = []
        for _ in range(20):
            root_svc = random.choice(SERVICE_NAMES)[0]
            total_ms = random.randint(180, 1800)
            spans = self._gen_spans(root_svc, total_ms)
            traces.append({
                "id": uuid.uuid4().hex[:16],
                "root_service": root_svc,
                "endpoint": random.choice(["POST /checkout", "GET /cart", "POST /payment", "GET /orders/{id}", "POST /login"]),
                "duration_ms": total_ms,
                "status": random.choices(["ok", "error"], weights=[85, 15])[0],
                "spans": spans,
                "started_at": (_now() - timedelta(minutes=random.randint(1, 120))).isoformat(),
            })
        return traces

    def _gen_spans(self, root_svc: str, total_ms: int):
        spans = []
        cursor = 0
        depth_chain = [(root_svc, 0)]
        for depth in range(random.randint(4, 8)):
            svc = random.choice(SERVICE_NAMES)[0]
            parent_depth = depth_chain[-1][1] if depth_chain else 0
            d = min(4, parent_depth + random.choice([0, 0, 1]))
            dur = max(5, int(total_ms * random.uniform(0.03, 0.28)))
            start = cursor
            cursor += random.randint(2, 20)
            spans.append({
                "id": uuid.uuid4().hex[:8],
                "service": svc,
                "operation": random.choice([
                    "http.request", "db.query", "kafka.produce", "kafka.consume",
                    "redis.get", "grpc.call", "auth.verify", "cache.lookup"
                ]),
                "start_ms": start,
                "duration_ms": dur,
                "depth": d,
                "status": random.choices(["ok", "error"], weights=[92, 8])[0],
            })
            depth_chain.append((svc, d))
        return spans

    def _gen_alert_rules(self):
        return [
            {"id": str(uuid.uuid4()), "name": "High p99 latency", "metric": "latency_p99_ms", "op": ">", "threshold": 800, "window_min": 5, "severity": "P2", "enabled": True},
            {"id": str(uuid.uuid4()), "name": "Error rate spike", "metric": "error_rate_pct", "op": ">", "threshold": 2.5, "window_min": 5, "severity": "P1", "enabled": True},
            {"id": str(uuid.uuid4()), "name": "Kafka consumer lag", "metric": "kafka_lag", "op": ">", "threshold": 5000, "window_min": 3, "severity": "P2", "enabled": True},
            {"id": str(uuid.uuid4()), "name": "CPU saturation", "metric": "cpu_pct", "op": ">", "threshold": 85, "window_min": 10, "severity": "P3", "enabled": True},
            {"id": str(uuid.uuid4()), "name": "DB connection pool exhaustion", "metric": "db_connections_pct", "op": ">", "threshold": 90, "window_min": 2, "severity": "P1", "enabled": True},
        ]

    def tick(self):
        """Advance simulation by one time step; mutate values with small deltas."""
        now = _now_iso()
        # services drift
        for s in self.services:
            s["rps"] = max(10, s["rps"] + random.uniform(-80, 80))
            s["latency_p50"] = max(10, s["latency_p50"] + random.randint(-8, 8))
            s["latency_p95"] = max(50, s["latency_p95"] + random.randint(-20, 20))
            s["latency_p99"] = max(80, s["latency_p99"] + random.randint(-40, 40))
            s["error_rate"] = max(0.0, round(s["error_rate"] + random.uniform(-0.4, 0.4), 2))
            s["cpu"] = max(2, min(99, round(s["cpu"] + random.uniform(-5, 5), 1)))
            s["memory"] = max(5, min(99, round(s["memory"] + random.uniform(-3, 3), 1)))
            # status flip occasionally
            if random.random() < 0.02:
                s["status"] = random.choices(["healthy", "degraded", "down"], weights=[70, 25, 5])[0]
        # kafka
        for t in self.kafka_topics:
            t["lag"] = max(0, int(t["lag"] + random.randint(-500, 700)))
            t["throughput_msg_s"] = max(10, round(t["throughput_msg_s"] + random.uniform(-200, 200), 1))
            if random.random() < 0.15:
                t["dlq_count"] += random.randint(0, 5)
        # k8s
        for p in self.pods:
            p["cpu_pct"] = max(1, min(99, round(p["cpu_pct"] + random.uniform(-6, 6), 1)))
            p["memory_pct"] = max(5, min(99, round(p["memory_pct"] + random.uniform(-3, 3), 1)))
        # db
        for d in self.databases:
            d["connections_active"] = max(5, min(d["connections_max"], d["connections_active"] + random.randint(-10, 10)))
            d["cpu"] = max(5, min(99, round(d["cpu"] + random.uniform(-4, 4), 1)))
            d["iops"] = max(100, d["iops"] + random.randint(-400, 400))
        # timeseries append (rolling last 60)
        for key in self.timeseries:
            if key == "latency":
                last = self.timeseries[key][-1]
                self.timeseries[key].append({
                    "t": now,
                    "p50": max(20, last["p50"] + random.randint(-8, 8)),
                    "p95": max(80, last["p95"] + random.randint(-20, 20)),
                    "p99": max(100, last["p99"] + random.randint(-40, 40)),
                })
            elif key == "error_rate":
                last = self.timeseries[key][-1]["v"]
                self.timeseries[key].append({"t": now, "v": max(0.0, round(last + random.uniform(-0.3, 0.3), 2))})
            elif key == "throughput":
                last = self.timeseries[key][-1]["v"]
                self.timeseries[key].append({"t": now, "v": max(1000, last + random.randint(-500, 500))})
            elif key in ("cpu", "memory"):
                last = self.timeseries[key][-1]["v"]
                self.timeseries[key].append({"t": now, "v": max(5, min(95, round(last + random.uniform(-3, 3), 1)))})
            # trim
            if len(self.timeseries[key]) > 60:
                self.timeseries[key] = self.timeseries[key][-60:]


SIM = SimState()


async def sim_loop():
    while True:
        try:
            SIM.tick()
        except Exception:
            pass
        await asyncio.sleep(5)
