"""Real notification delivery for Sentinel AI.
Each provider gracefully degrades to MOCKED when credentials/webhooks are missing.
Channel config is stored per-channel in Mongo (`sentinel_ai.channels.config`).
"""
import os
import logging
from typing import Any, Dict, Tuple

import httpx

logger = logging.getLogger("sentinel.notify")


async def _post(url: str, payload: Dict[str, Any], headers: Dict[str, str] | None = None) -> Tuple[bool, str]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(url, json=payload, headers=headers or {})
            if 200 <= r.status_code < 300:
                return True, f"HTTP {r.status_code}"
            return False, f"HTTP {r.status_code}: {r.text[:180]}"
    except Exception as e:
        return False, f"exception: {e}"


async def send_slack(webhook: str, subject: str, body: str, severity: str = "P2") -> Tuple[bool, str]:
    color = {"P1": "#ef4444", "P2": "#f59e0b", "P3": "#06b6d4"}.get(severity, "#a1a1aa")
    payload = {
        "attachments": [{
            "color": color,
            "title": subject,
            "text": body,
            "footer": "Sentinel AI",
            "mrkdwn_in": ["text"],
        }]
    }
    return await _post(webhook, payload)


async def send_teams(webhook: str, subject: str, body: str, severity: str = "P2") -> Tuple[bool, str]:
    color = {"P1": "EF4444", "P2": "F59E0B", "P3": "06B6D4"}.get(severity, "A1A1AA")
    payload = {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "themeColor": color,
        "summary": subject,
        "title": subject,
        "text": body,
    }
    return await _post(webhook, payload)


async def send_email_sendgrid(api_key: str, from_email: str, to_email: str, subject: str, body: str) -> Tuple[bool, str]:
    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": from_email, "name": "Sentinel AI"},
        "subject": subject,
        "content": [{"type": "text/plain", "value": body}],
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    ok, detail = await _post("https://api.sendgrid.com/v3/mail/send", payload, headers)
    # SendGrid returns 202 on success (already handled by 200-299)
    return ok, detail


async def deliver(channel: Dict[str, Any], subject: str, body: str, severity: str = "P2") -> Dict[str, Any]:
    """Dispatch to the right provider. Returns {delivered, detail, mocked}."""
    if not channel.get("enabled"):
        return {"delivered": False, "detail": "channel disabled", "mocked": True}

    ctype = channel["type"]
    cfg = channel.get("config") or {}

    # ---- SLACK ----
    if ctype == "slack":
        webhook = cfg.get("webhook_url") or os.environ.get("SLACK_WEBHOOK_URL")
        if not webhook:
            return {"delivered": False, "detail": "no webhook configured", "mocked": True}
        ok, detail = await send_slack(webhook, subject, body, severity)
        return {"delivered": ok, "detail": detail, "mocked": False}

    # ---- TEAMS ----
    if ctype == "teams":
        webhook = cfg.get("webhook_url") or os.environ.get("TEAMS_WEBHOOK_URL")
        if not webhook:
            return {"delivered": False, "detail": "no webhook configured", "mocked": True}
        ok, detail = await send_teams(webhook, subject, body, severity)
        return {"delivered": ok, "detail": detail, "mocked": False}

    # ---- EMAIL (SendGrid) ----
    if ctype == "email":
        api_key = cfg.get("api_key") or os.environ.get("SENDGRID_API_KEY")
        from_email = cfg.get("from_email") or os.environ.get("SENDGRID_FROM")
        to_email = channel.get("target")
        if not (api_key and from_email and to_email):
            return {"delivered": False, "detail": "SendGrid api_key/from_email/to missing", "mocked": True}
        ok, detail = await send_email_sendgrid(api_key, from_email, to_email, subject, body)
        return {"delivered": ok, "detail": detail, "mocked": False}

    # ---- PAGERDUTY (not implemented — keep MOCKED) ----
    if ctype == "pagerduty":
        return {"delivered": False, "detail": "PagerDuty integration pending", "mocked": True}

    return {"delivered": False, "detail": f"unknown channel type {ctype}", "mocked": True}
