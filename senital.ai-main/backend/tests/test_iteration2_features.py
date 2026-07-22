"""Iteration 2 feature tests for Sentinel AI:
- Notification channels persisted in Mongo with masking
- Real notification delivery (with MOCKED fallback)
- Alert rule CRUD + trigger
- Notification history
- WebSocket /api/ws/live
"""
import os
import time
import uuid
import json
import asyncio
import pytest
import requests
import websockets

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://sentinel-ai-79.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws/live"

CREDS = {
    "admin":  ("admin", "admin123"),
    "sre":    ("sre", "sre123"),
    "viewer": ("viewer", "viewer123"),
}


@pytest.fixture(scope="module")
def tokens():
    out = {}
    for k, (u, p) in CREDS.items():
        r = requests.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=15)
        assert r.status_code == 200
        out[k] = r.json()["token"]
    return out


def auth(t):
    return {"Authorization": f"Bearer {t}"}


# ---------- CHANNELS ----------
class TestChannels:
    def test_list_channels_with_masking(self, tokens):
        r = requests.get(f"{API}/notifications/channels", headers=auth(tokens["admin"]), timeout=10)
        assert r.status_code == 200
        chs = r.json()
        assert isinstance(chs, list) and len(chs) > 0
        for c in chs:
            for k in ["id", "type", "target", "enabled", "config", "configured"]:
                assert k in c, f"channel missing '{k}': {c}"
            # secret masking: no raw api_key/webhook_url present without …
            cfg = c["config"] or {}
            for k in ("api_key", "webhook_url"):
                if cfg.get(k):
                    assert "…" in str(cfg[k]) or cfg[k] == "•••", f"{k} not masked: {cfg[k]}"

    def test_viewer_cannot_write_channels(self, tokens):
        payload = {"type": "slack", "target": "#test", "enabled": True, "config": {}}
        r = requests.post(f"{API}/notifications/channels", headers=auth(tokens["viewer"]), json=payload, timeout=10)
        assert r.status_code == 403

    def test_sre_create_patch_delete_channel(self, tokens):
        payload = {"type": "slack", "target": f"#TEST-{uuid.uuid4().hex[:6]}", "enabled": True, "config": {}}
        r = requests.post(f"{API}/notifications/channels", headers=auth(tokens["sre"]), json=payload, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        cid = d["id"]
        assert d["type"] == "slack"
        assert d["configured"] is False  # empty config

        # patch — merge config
        r2 = requests.patch(f"{API}/notifications/channels/{cid}", headers=auth(tokens["sre"]),
                            json={"config": {"webhook_url": "https://hooks.slack.com/services/FAKE/URL/xxx"}}, timeout=10)
        assert r2.status_code == 200

        # re-fetch — webhook_url should be masked
        lst = requests.get(f"{API}/notifications/channels", headers=auth(tokens["sre"]), timeout=10).json()
        me = next(x for x in lst if x["id"] == cid)
        assert me["configured"] is True
        wh = me["config"]["webhook_url"]
        assert "…" in wh, f"webhook_url not masked: {wh}"

        # patch again with a different key — existing webhook_url should stay
        r3 = requests.patch(f"{API}/notifications/channels/{cid}", headers=auth(tokens["sre"]),
                            json={"config": {"extra_key": "hello"}}, timeout=10)
        assert r3.status_code == 200
        lst2 = requests.get(f"{API}/notifications/channels", headers=auth(tokens["sre"]), timeout=10).json()
        me2 = next(x for x in lst2 if x["id"] == cid)
        assert me2["config"].get("extra_key") == "hello"
        assert me2["config"].get("webhook_url"), "webhook_url got wiped on merge"

        # cleanup
        r4 = requests.delete(f"{API}/notifications/channels/{cid}", headers=auth(tokens["sre"]), timeout=10)
        assert r4.status_code == 200


# ---------- TEST CHANNEL (delivery) ----------
class TestChannelDelivery:
    def _find_or_create_slack(self, token):
        lst = requests.get(f"{API}/notifications/channels", headers=auth(token), timeout=10).json()
        slack = next((c for c in lst if c["type"] == "slack"), None)
        created = False
        if not slack:
            r = requests.post(f"{API}/notifications/channels", headers=auth(token),
                              json={"type": "slack", "target": "#TEST-slack", "enabled": True, "config": {}}, timeout=10)
            slack = r.json()
            created = True
        return slack, created

    def test_slack_empty_config_is_mocked(self, tokens):
        # create fresh slack channel with empty config so state is deterministic
        r = requests.post(f"{API}/notifications/channels", headers=auth(tokens["sre"]),
                          json={"type": "slack", "target": f"#TEST-mock-{uuid.uuid4().hex[:6]}",
                                "enabled": True, "config": {}}, timeout=10)
        assert r.status_code == 200
        cid = r.json()["id"]

        t = requests.post(f"{API}/notifications/channels/{cid}/test",
                          headers=auth(tokens["sre"]),
                          json={"subject": "TEST subj", "body": "TEST body", "severity": "P3"}, timeout=15)
        assert t.status_code == 200
        d = t.json()
        assert d["mocked"] is True, f"expected mocked=True with empty config, got {d}"
        assert d["delivered"] is False
        assert "webhook" in d["detail"].lower() or "no" in d["detail"].lower()

        # add fake webhook and re-test — should attempt real delivery (mocked=false, delivered=false)
        p = requests.patch(f"{API}/notifications/channels/{cid}", headers=auth(tokens["sre"]),
                           json={"config": {"webhook_url": "https://hooks.slack.com/services/FAKE/URL/xxx"}}, timeout=10)
        assert p.status_code == 200
        t2 = requests.post(f"{API}/notifications/channels/{cid}/test",
                           headers=auth(tokens["sre"]), json={}, timeout=20)
        assert t2.status_code == 200
        d2 = t2.json()
        assert d2["mocked"] is False, f"expected mocked=False when webhook configured, got {d2}"
        # delivered may be False (fake URL 404) or True (Slack accepts invalid webhook with 200) — accept both
        assert "detail" in d2 and isinstance(d2["detail"], str)
        # It should contain 'HTTP' or 'exception' for real attempt
        assert ("HTTP" in d2["detail"]) or ("exception" in d2["detail"].lower())

        # cleanup
        requests.delete(f"{API}/notifications/channels/{cid}", headers=auth(tokens["sre"]), timeout=10)

    def test_viewer_cannot_test_channel(self, tokens):
        lst = requests.get(f"{API}/notifications/channels", headers=auth(tokens["viewer"]), timeout=10).json()
        assert lst, "no channels available"
        cid = lst[0]["id"]
        r = requests.post(f"{API}/notifications/channels/{cid}/test",
                          headers=auth(tokens["viewer"]), json={}, timeout=10)
        assert r.status_code == 403


# ---------- ALERT RULES ----------
class TestAlertRules:
    def test_list_rules_persisted(self, tokens):
        r = requests.get(f"{API}/notifications/alert-rules", headers=auth(tokens["viewer"]), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_rule_crud_and_trigger(self, tokens):
        payload = {"name": f"TEST_rule_{uuid.uuid4().hex[:6]}", "metric": "latency_p99_ms",
                   "op": ">", "threshold": 999.0, "window_min": 5, "severity": "P2", "enabled": True}
        r = requests.post(f"{API}/notifications/alert-rules", headers=auth(tokens["sre"]), json=payload, timeout=10)
        assert r.status_code == 200, r.text
        rid = r.json()["id"]

        # patch
        pr = requests.patch(f"{API}/notifications/alert-rules/{rid}", headers=auth(tokens["sre"]),
                            json={"threshold": 750.0}, timeout=10)
        assert pr.status_code == 200

        # verify persistence
        lst = requests.get(f"{API}/notifications/alert-rules", headers=auth(tokens["viewer"]), timeout=10).json()
        me = next((x for x in lst if x["id"] == rid), None)
        assert me is not None
        assert me["threshold"] == 750.0

        # viewer cannot patch
        vp = requests.patch(f"{API}/notifications/alert-rules/{rid}", headers=auth(tokens["viewer"]),
                            json={"threshold": 100.0}, timeout=10)
        assert vp.status_code == 403

        # trigger
        trig = requests.post(f"{API}/notifications/alert-rules/{rid}/trigger",
                             headers=auth(tokens["sre"]), timeout=30)
        assert trig.status_code == 200, trig.text
        td = trig.json()
        assert "rule" in td and "results" in td
        assert isinstance(td["results"], list)
        for res in td["results"]:
            assert "delivered" in res and "mocked" in res and "detail" in res
            assert "channel" in res

        # viewer cannot trigger
        vt = requests.post(f"{API}/notifications/alert-rules/{rid}/trigger",
                           headers=auth(tokens["viewer"]), timeout=15)
        assert vt.status_code == 403

        # cleanup
        d = requests.delete(f"{API}/notifications/alert-rules/{rid}", headers=auth(tokens["sre"]), timeout=10)
        assert d.status_code == 200


# ---------- HISTORY ----------
class TestNotificationHistory:
    def test_history_returns_rows(self, tokens):
        r = requests.get(f"{API}/notifications/history", headers=auth(tokens["viewer"]), timeout=10)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) > 0
        # after prior tests, at least some rows should have delivered/mocked/detail
        real = [row for row in rows if "delivered" in row and "mocked" in row]
        assert real, f"expected real history rows with delivered/mocked, got {rows[:2]}"


# ---------- WEBSOCKET ----------
class TestWebSocket:
    def test_ws_requires_valid_token(self, tokens):
        async def bad():
            try:
                async with websockets.connect(WS_URL + "?token=BADTOKEN", open_timeout=10) as ws:
                    # server should close immediately with 1008
                    await ws.recv()
                    return "opened"
            except websockets.exceptions.InvalidStatus as e:
                return f"invalid_status:{e.response.status_code}"
            except websockets.exceptions.ConnectionClosed as e:
                return f"closed:{e.code}"
            except Exception as e:
                return f"error:{type(e).__name__}:{e}"
        result = asyncio.get_event_loop().run_until_complete(bad())
        # Accept either an immediate close with code 1008 OR connect rejected
        assert ("1008" in result) or ("closed" in result) or ("invalid_status" in result), f"unexpected: {result}"

    def test_ws_valid_token_receives_init_and_tick(self, tokens):
        token = tokens["admin"]

        async def run():
            got_init = False
            got_tick = False
            async with websockets.connect(WS_URL + f"?token={token}", open_timeout=10, ping_interval=None) as ws:
                # wait for init
                msg = await asyncio.wait_for(ws.recv(), timeout=6)
                d = json.loads(msg)
                assert d.get("kind") == "init"
                assert "snapshot" in d and "timeseries" in d
                got_init = True
                # wait for tick (ticks come every ~3s)
                try:
                    msg2 = await asyncio.wait_for(ws.recv(), timeout=8)
                    d2 = json.loads(msg2)
                    assert d2.get("kind") == "tick"
                    assert "snapshot" in d2
                    got_tick = True
                except asyncio.TimeoutError:
                    pass
            return got_init, got_tick

        got_init, got_tick = asyncio.get_event_loop().run_until_complete(run())
        assert got_init, "did not receive init frame"
        assert got_tick, "did not receive tick frame within 8s"
