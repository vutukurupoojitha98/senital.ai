# Sentinel AI — Autonomous Production Intelligence Platform

An enterprise-grade, AI-first observability & incident intelligence platform inspired by systems used at SoFi, Capital One, Goldman Sachs, Netflix, Uber and Microsoft.

Sentinel AI unifies **logs, metrics, traces, Kafka events, PostgreSQL health, Kubernetes state, and deployment metadata**, and applies an LLM copilot (Claude Sonnet 4.5) to **detect, correlate and explain** production incidents in seconds.

---

## Highlights

- **Real-time observability dashboard** — latency percentiles, error rate, throughput, MTTR, active incidents, health score
- **AI incident detection** with confidence scoring
- **AI Root Cause Analysis** — LLM correlates deploys, Kafka lag, K8s events, DB pressure into an evidence-based RCA
- **AI Production Copilot** — streaming natural-language chat grounded in live telemetry
- **Kafka monitoring** — consumer lag, DLQ, retries, throughput + AI failure prediction
- **Kubernetes monitoring** — pod health, CrashLoopBackOff, CPU/memory, HPA, restarts
- **Database intelligence** — slow queries, index recommendations with estimated performance gain, connection-pool pressure
- **Deployment risk analyzer** — analyzes commits & metadata to score risk pre-release
- **Distributed tracing** — waterfall / Gantt visualization with bottleneck detection
- **Incident timeline** — chronological correlated event stream
- **Notifications** — Email / Slack / Microsoft Teams / PagerDuty routing rules (MOCKED delivery)
- **Admin console** — users, RBAC, thresholds, AI settings, audit trail
- **JWT authentication + RBAC** (ADMIN, SRE, DEVELOPER, VIEWER)

## Architecture (production reference)

```
                                     ┌─────────────────────────┐
                                     │      Frontend (React)   │
                                     │  Recharts · Tailwind    │
                                     │  IBM Plex Sans/Mono     │
                                     └───────────┬─────────────┘
                                                 │  HTTPS + JWT
                                                 ▼
                                     ┌─────────────────────────┐
                                     │   API Gateway (Spring   │
                                     │   Cloud Gateway)        │
                                     └───────────┬─────────────┘
                                                 │
   ┌──────────────┬──────────────┬───────────────┼───────────────┬──────────────┐
   ▼              ▼              ▼               ▼               ▼              ▼
┌───────┐     ┌────────┐     ┌────────┐     ┌───────────┐   ┌────────┐    ┌───────────┐
│ Auth  │     │Incident│     │ Kafka  │     │Kubernetes │   │  DB    │    │ Copilot   │
│Service│     │Service │     │Monitor │     │  Monitor  │   │Insights│    │ (LLM)     │
└───┬───┘     └────┬───┘     └────┬───┘     └─────┬─────┘   └────┬───┘    └─────┬─────┘
    │              │              │               │              │              │
    ▼              ▼              ▼               ▼              ▼              ▼
                       ┌────────────────────────────────┐
                       │        Data & Streaming        │
                       │  PostgreSQL · Redis · Kafka    │
                       └────────────────────────────────┘

Service Registry: Eureka | Config: Spring Cloud Config | Tracing: OpenTelemetry / Tempo
Deployment: Docker + Kubernetes (AKS) | CI/CD: GitHub Actions | IaC: Terraform
```

## This repo — reference implementation

For the interactive demo in this environment, the entire platform is delivered as a **React + FastAPI + MongoDB** reference implementation that mirrors the production Spring Boot architecture 1:1 in feature surface. The FastAPI backend simulates all 12 modules with a background telemetry generator and connects to Claude Sonnet 4.5 via the Emergent LLM key for real AI incident analysis.

### Tech stack (demo)

| Layer | Technology |
| --- | --- |
| Frontend | React 19, React Router 7, Recharts, Tailwind, IBM Plex Sans/Mono, Lucide, Sonner |
| Backend  | FastAPI, Motor (MongoDB async), Pydantic v2, `emergentintegrations` |
| AI       | Claude Sonnet 4.5 via Emergent LLM Key (streaming SSE) |
| Auth     | JWT (PyJWT) + bcrypt · role-based access control |
| Storage  | MongoDB (users, chat history, audit log) + in-memory simulator |

### Tech stack (production Spring Boot mapping)

| Concern | Production stack |
| --- | --- |
| Language / Framework | Java 17 + Spring Boot 3 |
| API Gateway | Spring Cloud Gateway |
| Service Registry | Eureka |
| Config | Spring Cloud Config |
| Auth | Spring Security + JWT + RBAC |
| Data | PostgreSQL, Redis, Apache Kafka |
| Container | Docker, Kubernetes (AKS) |
| Cloud | Azure (AKS · Azure Monitor · Cosmos DB optional) |
| CI/CD | GitHub Actions |
| Observability | OpenTelemetry + Prometheus + Tempo + Grafana |

## Running locally

Both services are managed by `supervisor` inside the container.

```bash
sudo supervisorctl restart backend
sudo supervisorctl restart frontend
```

## Demo credentials

| Role | Username | Password |
| --- | --- | --- |
| ADMIN | `admin` | `admin123` |
| SRE | `sre` | `sre123` |
| DEVELOPER | `developer` | `dev123` |
| VIEWER | `viewer` | `viewer123` |

## Key API endpoints

```
POST /api/auth/login                     Login, returns JWT
GET  /api/auth/me                        Current user
GET  /api/dashboard/overview             KPIs + timeseries
GET  /api/services                       Service registry with health
GET  /api/incidents                      List incidents
GET  /api/incidents/{id}                 Detail + timeline + correlated events
POST /api/copilot/rca/{id}               Generate AI RCA
POST /api/copilot/chat/stream            SSE-streamed AI chat
POST /api/copilot/deployment-risk/{id}   AI deployment risk analysis
GET  /api/kafka/topics                   Kafka topic health
GET  /api/k8s/pods                       Kubernetes pods
GET  /api/database/slow-queries          Slow query log with index recos
GET  /api/deployments                    Recent deployments with risk score
GET  /api/traces                         Distributed traces
GET  /api/notifications/alert-rules      Alert rules CRUD
GET  /api/admin/users                    User management (ADMIN only)
GET  /api/admin/audit-log                Audit trail (ADMIN only)
```

## Notes

- Monitoring data (Kafka, K8s, DB, traces, incidents, deployments) is generated by a realistic in-memory simulator that mutates every 5s. In production these come from OpenTelemetry pipelines, Kafka JMX exporters, Prometheus, and RDS Performance Insights respectively.
- Notification delivery is **MOCKED**. Wire up SendGrid / Slack / MS Teams webhooks in `notifications` to enable real delivery.
- The AI Copilot uses **Emergent Universal LLM Key** (Claude Sonnet 4.5). Chat history is persisted in MongoDB per-session.
