"""Backend test suite for Sentinel AI platform.

Covers:
- Auth (login, /auth/me, role enforcement)
- Dashboard overview (KPIs + timeseries)
- Services, Incidents (list + detail), Kafka, K8s, DB, Deployments, Traces
- AI Copilot: RCA, non-streaming chat, streaming SSE, deployment-risk
- Notifications alert-rules (RBAC)
- Admin routes (users CRUD, thresholds, ai-settings, audit-log)
"""
import os
import json
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://sentinel-ai-79.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "admin":     ("admin",     "admin123",   "ADMIN"),
    "sre":       ("sre",       "sre123",     "SRE"),
    "developer": ("developer", "dev123",     "DEVELOPER"),
    "viewer":    ("viewer",    "viewer123",  "VIEWER"),
}


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def tokens():
    """Login all seed users and return token dict."""
    out = {}
    for key, (u, p, _role) in CREDS.items():
        r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=15)
        assert r.status_code == 200, f"login {u} failed: {r.status_code} {r.text}"
        data = r.json()
        assert "token" in data and "user" in data
        assert data["user"]["role"] == _role
        assert data["user"]["username"] == u
        out[key] = data["token"]
    return out


def auth(t):
    return {"Authorization": f"Bearer {t}"}


# ---------- AUTH ----------
class TestAuth:
    def test_login_valid_admin(self):
        r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["role"] == "ADMIN"
        assert isinstance(d["token"], str) and len(d["token"]) > 20

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "wrong"}, timeout=10)
        assert r.status_code == 401

    def test_login_unknown_user(self):
        r = requests.post(f"{API}/auth/login", json={"username": "nouser", "password": "x"}, timeout=10)
        assert r.status_code == 401

    def test_me_requires_token(self):
        r = requests.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401

    def test_me_with_token(self, tokens):
        r = requests.get(f"{API}/auth/me", headers=auth(tokens["sre"]), timeout=10)
        assert r.status_code == 200
        assert r.json()["username"] == "sre"


# ---------- DASHBOARD ----------
class TestDashboard:
    def test_overview_shape(self, tokens):
        r = requests.get(f"{API}/dashboard/overview", headers=auth(tokens["admin"]), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ["health_score", "services", "throughput_rps", "latency_p99_ms",
                  "error_rate_pct", "active_incidents", "kafka_lag_total",
                  "mttr_minutes", "ai_confidence", "timeseries"]:
            assert k in d, f"missing key {k}"
        assert set(d["services"].keys()) >= {"healthy", "degraded", "down", "total"}
        ts = d["timeseries"]
        for k in ["latency", "error_rate", "throughput", "cpu", "memory"]:
            assert k in ts and isinstance(ts[k], list) and len(ts[k]) > 0


# ---------- SERVICES ----------
class TestServices:
    def test_list_services(self, tokens):
        r = requests.get(f"{API}/services", headers=auth(tokens["viewer"]), timeout=10)
        assert r.status_code == 200
        svcs = r.json()
        assert isinstance(svcs, list) and len(svcs) == 12
        for s in svcs:
            for k in ["name", "status", "version", "rps", "latency_p99", "error_rate", "cpu", "memory"]:
                assert k in s


# ---------- INCIDENTS ----------
class TestIncidents:
    def test_list_incidents(self, tokens):
        r = requests.get(f"{API}/incidents", headers=auth(tokens["viewer"]), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) > 0

    def test_incident_detail(self, tokens):
        lst = requests.get(f"{API}/incidents", headers=auth(tokens["viewer"]), timeout=10).json()
        inc_id = lst[0]["id"]
        r = requests.get(f"{API}/incidents/{inc_id}", headers=auth(tokens["viewer"]), timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "correlated_events" in d and isinstance(d["correlated_events"], list)
        assert "timeline" in d and isinstance(d["timeline"], list) and len(d["timeline"]) >= 5


# ---------- KAFKA / K8S / DB / DEPLOYMENTS / TRACES ----------
class TestPlatform:
    def test_kafka_topics(self, tokens):
        r = requests.get(f"{API}/kafka/topics", headers=auth(tokens["viewer"]), timeout=10)
        assert r.status_code == 200
        topics = r.json()
        assert len(topics) > 0
        t = topics[0]
        for k in ["lag", "dlq_count", "ai_prediction"]:
            assert k in t

    def test_kafka_summary(self, tokens):
        r = requests.get(f"{API}/kafka/summary", headers=auth(tokens["viewer"]), timeout=10)
        assert r.status_code == 200
        d = r.json()
        for k in ["topics_count", "total_lag", "throughput_msg_s", "dlq_count", "at_risk_topics"]:
            assert k in d

    def test_k8s(self, tokens):
        r = requests.get(f"{API}/k8s/pods", headers=auth(tokens["viewer"]), timeout=10)
        assert r.status_code == 200 and isinstance(r.json(), list)
        r2 = requests.get(f"{API}/k8s/summary", headers=auth(tokens["viewer"]), timeout=10)
        assert r2.status_code == 200
        s = r2.json()
        for k in ["crashloop", "running", "pending", "total"]:
            assert k in s

    def test_database(self, tokens):
        r1 = requests.get(f"{API}/database/instances", headers=auth(tokens["viewer"]), timeout=10)
        r2 = requests.get(f"{API}/database/slow-queries", headers=auth(tokens["viewer"]), timeout=10)
        r3 = requests.get(f"{API}/database/summary", headers=auth(tokens["viewer"]), timeout=10)
        assert r1.status_code == 200 and len(r1.json()) > 0
        assert r2.status_code == 200 and len(r2.json()) > 0
        assert r3.status_code == 200
        assert "instances" in r3.json()

    def test_deployments(self, tokens):
        r = requests.get(f"{API}/deployments", headers=auth(tokens["viewer"]), timeout=10)
        assert r.status_code == 200
        deps = r.json()
        assert len(deps) > 0
        d0 = deps[0]
        for k in ["risk_score", "risk_level", "commit_message"]:
            assert k in d0

    def test_traces(self, tokens):
        r = requests.get(f"{API}/traces", headers=auth(tokens["viewer"]), timeout=10)
        assert r.status_code == 200
        traces = r.json()
        assert len(traces) > 0
        tid = traces[0]["id"]
        r2 = requests.get(f"{API}/traces/{tid}", headers=auth(tokens["viewer"]), timeout=10)
        assert r2.status_code == 200
        assert "bottleneck_span_id" in r2.json()


# ---------- NOTIFICATIONS RBAC ----------
class TestNotifications:
    def test_get_alert_rules_any_role(self, tokens):
        r = requests.get(f"{API}/notifications/alert-rules", headers=auth(tokens["viewer"]), timeout=10)
        assert r.status_code == 200

    def test_viewer_cannot_create_rule(self, tokens):
        payload = {"name": "TEST_viewer_deny", "metric": "latency_p99_ms", "op": ">",
                   "threshold": 500, "window_min": 5, "severity": "high", "enabled": True}
        r = requests.post(f"{API}/notifications/alert-rules", headers=auth(tokens["viewer"]), json=payload, timeout=10)
        assert r.status_code == 403

    def test_sre_create_and_delete_rule(self, tokens):
        payload = {"name": f"TEST_rule_{uuid.uuid4().hex[:6]}", "metric": "error_rate_pct", "op": ">",
                   "threshold": 3.0, "window_min": 10, "severity": "high", "enabled": True}
        r = requests.post(f"{API}/notifications/alert-rules", headers=auth(tokens["sre"]), json=payload, timeout=10)
        assert r.status_code == 200
        rid = r.json()["id"]
        r2 = requests.delete(f"{API}/notifications/alert-rules/{rid}", headers=auth(tokens["sre"]), timeout=10)
        assert r2.status_code == 200


# ---------- ADMIN RBAC ----------
class TestAdmin:
    def test_viewer_forbidden(self, tokens):
        for path in ["/admin/users", "/admin/thresholds", "/admin/ai-settings", "/admin/audit-log"]:
            r = requests.get(f"{API}{path}", headers=auth(tokens["viewer"]), timeout=10)
            assert r.status_code == 403, f"expected 403 for viewer at {path}, got {r.status_code}"

    def test_admin_get_users(self, tokens):
        r = requests.get(f"{API}/admin/users", headers=auth(tokens["admin"]), timeout=10)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list) and len(users) >= 4

    def test_admin_thresholds_and_ai(self, tokens):
        r = requests.get(f"{API}/admin/thresholds", headers=auth(tokens["admin"]), timeout=10)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/admin/ai-settings", headers=auth(tokens["admin"]), timeout=10)
        assert r2.status_code == 200

    def test_admin_audit_log(self, tokens):
        r = requests.get(f"{API}/admin/audit-log", headers=auth(tokens["admin"]), timeout=10)
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_admin_create_update_delete_user(self, tokens):
        uname = f"TEST_user_{uuid.uuid4().hex[:6]}"
        payload = {"username": uname, "email": f"{uname}@t.io",
                   "password": "pass1234", "full_name": "Test User", "role": "VIEWER"}
        r = requests.post(f"{API}/admin/users", headers=auth(tokens["admin"]), json=payload, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["username"] == uname and d["role"] == "VIEWER"

        # verify via GET
        r_list = requests.get(f"{API}/admin/users", headers=auth(tokens["admin"]), timeout=10)
        assert any(u["username"] == uname for u in r_list.json())

        # patch
        r_patch = requests.patch(f"{API}/admin/users/{uname}", headers=auth(tokens["admin"]),
                                 json={"full_name": "Updated Name"}, timeout=10)
        assert r_patch.status_code == 200

        # delete
        r_del = requests.delete(f"{API}/admin/users/{uname}", headers=auth(tokens["admin"]), timeout=10)
        assert r_del.status_code == 200

    def test_admin_cannot_delete_primary(self, tokens):
        r = requests.delete(f"{API}/admin/users/admin", headers=auth(tokens["admin"]), timeout=10)
        assert r.status_code == 400


# ---------- COPILOT / LLM ----------
class TestCopilot:
    def test_copilot_chat_sync(self, tokens):
        payload = {"session_id": f"pytest-{uuid.uuid4().hex[:6]}", "message": "Give me a one sentence summary of platform health."}
        r = requests.post(f"{API}/copilot/chat", headers=auth(tokens["sre"]), json=payload, timeout=90)
        assert r.status_code == 200, f"chat failed: {r.status_code} {r.text[:400]}"
        d = r.json()
        assert "response" in d and isinstance(d["response"], str) and len(d["response"]) > 20

    def test_copilot_chat_stream(self, tokens):
        payload = {"session_id": f"pytest-stream-{uuid.uuid4().hex[:6]}", "message": "In 2 sentences, describe the top incident risk right now."}
        with requests.post(f"{API}/copilot/chat/stream", headers=auth(tokens["sre"]), json=payload,
                           timeout=120, stream=True) as r:
            assert r.status_code == 200
            assert "text/event-stream" in r.headers.get("content-type", "")
            chunks = []
            got_done = False
            for line in r.iter_lines(decode_unicode=True):
                if not line:
                    continue
                if line.startswith("data:"):
                    payload = line[len("data:"):].strip()
                    if payload == "[DONE]":
                        got_done = True
                        break
                    chunks.append(payload)
            assert got_done, "did not receive [DONE] terminator"
            assert len("".join(chunks)) > 20, "streamed content too short"

    def test_generate_rca(self, tokens):
        incs = requests.get(f"{API}/incidents", headers=auth(tokens["sre"]), timeout=10).json()
        inc_id = incs[0]["id"]
        r = requests.post(f"{API}/copilot/rca/{inc_id}", headers=auth(tokens["sre"]), timeout=90)
        assert r.status_code == 200, f"rca failed: {r.status_code} {r.text[:300]}"
        d = r.json()
        assert "root_cause" in d and isinstance(d["root_cause"], str) and len(d["root_cause"]) > 30
        assert "correlated_events" in d

    def test_deployment_risk_ai(self, tokens):
        deps = requests.get(f"{API}/deployments", headers=auth(tokens["sre"]), timeout=10).json()
        dep_id = deps[0]["id"]
        r = requests.post(f"{API}/copilot/deployment-risk/{dep_id}", headers=auth(tokens["sre"]), timeout=90)
        assert r.status_code == 200, f"deployment-risk failed: {r.status_code} {r.text[:300]}"
        d = r.json()
        assert "ai_summary" in d and len(d["ai_summary"]) > 30
