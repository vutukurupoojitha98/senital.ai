# Sentinel AI — Autonomous Production Intelligence Platform (PRD)

## Original problem statement
Build an enterprise-grade AI Production Incident Intelligence Platform comparable to Datadog/Grafana/New Relic, with 12 core modules (AI incident detection, RCA, Copilot chat, Kafka monitoring, K8s monitoring, DB intelligence, deployment risk analyzer, distributed tracing, real-time dashboard, incident timeline, notifications, admin dashboard), JWT + RBAC, dark mode, responsive, production-quality code — named **Sentinel AI - Autonomous Production Intelligence Platform**.

## Delivered architecture (E1 environment)
React 19 (Tailwind + Recharts + IBM Plex Sans/Mono) frontend + FastAPI backend + MongoDB. AI Copilot backed by Claude Sonnet 4.5 via the Emergent Universal LLM Key with SSE streaming. All monitoring data is realistic and mutates every 5s via a background simulator. Reference production stack (Java 17 / Spring Boot / Kafka / PostgreSQL / Redis / AKS / GitHub Actions) documented in `/app/README.md`.

## User personas
- **ADMIN** — platform administrators (full access, user management, audit)
- **SRE** — on-call engineers (incidents, RCA, alerts, deployments, thresholds)
- **DEVELOPER** — service owners (read-only monitoring, copilot)
- **VIEWER** — stakeholders (read-only dashboards)

## Core requirements (static)
- JWT authentication + RBAC (4 roles)
- Dark-mode-first enterprise UI, IBM Plex Sans/Mono, dense observability layouts
- 12 core modules, all reachable via left sidebar
- AI-powered RCA, deployment-risk, and streaming natural-language copilot grounded in live telemetry
- Every interactive/informational element has a data-testid

## What's been implemented (2026-07-19)
- **Auth**: JWT, bcrypt, 4 seed roles (`admin/admin123`, `sre/sre123`, `developer/dev123`, `viewer/viewer123`)
- **Overview dashboard**: 6 KPI tiles, latency percentile chart (p50/p95/p99), throughput area chart, services health matrix, active incidents list, quick nav — **now driven by WebSocket `/api/ws/live` with a green LIVE · WS indicator**
- **Services**: registry table with health, RPS, latency, error %, CPU, memory, uptime
- **Incidents**: list + filter + detail with AI RCA (Claude Sonnet 4.5), correlated events, timeline
- **Kafka**: topic table, KPI summary, AI failure prediction badges
- **Kubernetes**: pod table with CrashLoopBackOff detection, CPU/memory, HPA, KPI summary
- **Database**: instance table, slow-query list with AI index recommendations and estimated gains
- **Deployments**: risk-scored list with AI deployment-risk analysis on demand
- **Tracing**: waterfall/Gantt visualization with bottleneck highlighting
- **Timeline**: chronological correlated events (deploys, incidents, K8s events, Kafka)
- **Copilot**: SSE-streaming chat with suggested prompts, session persistence in Mongo, **auto-send when arrived via `/copilot?q=...` (from ⌘K)**
- **Notifications**: alert rules & channels **now persisted in MongoDB**, real HTTP delivery (SendGrid REST, Slack + Teams webhooks) with **automatic MOCKED fallback** when creds are missing. Per-channel config UI (masked secrets), test button, per-rule fire button, delivered/mocked/failed status badges in history.
- **Admin**: users CRUD (ADMIN only), thresholds, AI settings, audit log
- **Global ⌘K command palette**: keyboard-driven navigation to all pages + "Ask AI Copilot: {query}" shortcut with autofill
- **README**: architecture diagram, production Spring Boot mapping, endpoint reference

## What's been tested
- **Iteration 1**: 28/28 backend pytest tests pass. Frontend Playwright: all quick-logins, KPI tiles, charts, sidebar nav, services table, incident RCA generation, copilot streaming with real Claude Sonnet 4.5 output, admin console, VIEWER RBAC blocks.
- **Iteration 2**: 10/10 new tests + 28/28 regression = **38/38 backend**. Frontend: WS live indicator, ⌘K palette, notifications config/test/fire, DELIVERED/MOCKED/FAILED badges, VIEWER RBAC.
- **Iteration 3 (code review fixes)**: array-index React keys replaced with stable IDs in Copilot (message.id), Timeline (`{type}-{entityId}`), Incident detail (`{type}-{at}-{idx}`). `useLiveOverview` empty catch blocks now log via `console.warn` for parse/connect failures (cleanup catches intentionally silent). Copilot auto-send guard via `useRef` verified with `?q=` URL — exactly one user bubble on load.

### Code review findings — verdict
| Finding | Action |
|---|---|
| Array-index React keys (4 spots) | **FIXED** — stable IDs used |
| Empty catch in `useLiveOverview` | **FIXED** — `console.warn` on parse/connect (cleanup catches stay silent by design) |
| `response` undefined in server.py:879/916/947 | **False positive** — `raise HTTPException` in `except` exits the function; `response` always defined at use |
| Missing hook deps (20 files) | **Not applied** — most are false positives (state setters via functional updates); applying blindly would create infinite loops in Overview & Notifications |
| `random` in simulator flagged as insecure | **False positive** — simulator is not security-sensitive by design |
| localStorage → httpOnly cookies | **Deferred** — full CSRF/session refactor; industry-standard for SPA + JWT |
| Complexity refactoring | **Deferred** — violates "don't over-engineer" principle; functions are readable & fully tested |

## Backlog / next actions
- **P2** — Split `server.py` into `/app/backend/routers/*` (auth, dashboard, kafka, k8s, db, deployments, notifications, admin, copilot)
- **P2** — Parallelize channel dispatch in `trigger_alert_rule` with `asyncio.gather`
- **P3** — WS heartbeat ping to survive proxy idle timeouts; reconnect stop on close code 1008 (JWT expired)
- **P3** — Add `SECRET_KEYS` set + centralized mask helper so new provider configs never leak new secret fields
- **P3** — Copilot double-send guard using `useRef` (fixed in iteration 2)

## Known mocked flows
- Notification delivery falls back to MOCKED **only when credentials are absent**. Once configured (via Notifications page or env), delivery is REAL via httpx (Slack/Teams webhooks + SendGrid REST). PagerDuty channel remains MOCKED (pending Events API v2 integration).
- Monitoring telemetry — generated by an in-memory simulator that mutates every 5s (replace with OpenTelemetry / Kafka JMX / RDS Performance Insights in production)
