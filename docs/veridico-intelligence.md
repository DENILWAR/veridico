# Verídico Intelligence — landing + interactive demo

Two deployables:

- **Frontend**: static site on Vercel (no build step). ES modules in `assets/js`.
- **Backend** (`backend/`): Fastify + TypeScript service on Railway. See [backend/README.md](../backend/README.md).

```
Browser → Verídico frontend (Vercel) → Verídico backend (Railway) → SON Intelligence Gateway → model provider
                                            └─ unavailable / timeout → deterministic-demo
```

Verídico builds the operational truth (session, events, detected workflow, recommendation, estimates).
SON Intelligence reasons about it and owns model, provider, routing and product policy.

## Structure

| Path | Role |
|---|---|
| `index.html` | Landing (6 sections) + legal modals. Handles `?source=` / `?q=` entry routing. |
| `experience.html` | Verídico Intelligence product shell: Overview, Session, Workflows, Recommendations, Intelligence, Sources, Summary. |
| `assets/css/tokens.css` | Design tokens (`--veridico-green*`), status badges, buttons, flow engine, portal. |
| `assets/js/i18n.js` + `i18n/{en,es,de}.js` | i18n. EN default; `?lang=`, then saved choice, then browser language. |
| `assets/js/flow.js` | Intelligence Pulse: SVG connections + pulses (single rAF loop, pauses off-screen). |
| `assets/js/portal.js` | Portal transition (`portalArrive`, `portalEnter`). |
| `assets/js/demo/config.js` | `DEMO_THRESHOLD`, similarity, volume assumption… (`?threshold=` overrides for presenters). |
| `assets/js/demo/session.js` | ObservationSession: records events, segments executions. |
| `assets/js/demo/detector.js` | Deterministic recurring-workflow detector (LCS sequence similarity). |
| `assets/js/demo/recommend.js` | Automation recommendation, role evolution, summary metrics. |
| `assets/js/demo/desktop.js`, `apps/*` | Desktop window manager, ORDR demo CRM, SON Files, SON Browser. |
| `assets/js/runtime-config.js` | `VERIDICO_API_URL`: public backend URL (edit per deployment; not a secret). |
| `assets/js/intelligence/gateway.js` | Single Intelligence client, `buildIntelligenceContext()`, `DemoIntelligenceProvider` (deterministic-demo). |
| `backend/` | Railway service: `/health`, `/ready`, `/api/intelligence`, `/api/leads`. |

## Run locally

```bash
python3 -m http.server 8765   # ES modules need http://, not file://
```

With `VERIDICO_API_URL = ''` the chat answers with the deterministic demo provider and the lead form shows its email alternative. To use the backend locally, run it (`cd backend && npm run dev` with a `.env`) and temporarily set `VERIDICO_API_URL` in `assets/js/runtime-config.js` to its URL. Don't commit that change.

## Entry routing (denilsonarnau.com)

- `/?source=denilsonarnau` → the portal plays, then lands on the hero.
- `/?source=denilsonarnau&q=<question>` → the portal stays covered and the page redirects to `experience.html?entry=portal&view=intelligence&q=…`. There the portal opens on the Intelligence chat, the question is prefilled and answered, and the answer offers "Experience this with a real workflow" and "Explore the product".
- Landing CTA "Experience Verídico" → portal (enter) → `experience.html?entry=portal`.

## Events and detection

Events come only from user actions in the demo:

`crm.invoice.open`, `crm.invoice.read` (invoice kept open ≥ `READ_DWELL_MS`), `crm.client.search`, `crm.client.select` (with `taxMatch`), `crm.invoice.classify`, `crm.invoice.status_change`, `crm.task.create` / `crm.task.update`, `crm.invoice.save`, `crm.queue.return`, `files.document.open`, `browser.tool.open`, `browser.document.process`.

An execution runs from `crm.invoice.open` to `crm.invoice.save` for the same invoice. After every completed execution the detector:

1. maps events to steps and collapses consecutive repeats;
2. groups executions whose pairwise LCS similarity is ≥ `SIMILARITY_MIN`;
3. reports a recurring workflow when a group reaches `DEMO_THRESHOLD`;
4. rebuilds the consensus workflow (steps seen in more than half of the executions, ordered by mean position) plus its variants.

There is no timer and no ML. The UI says so in the Workflows view ("How this was detected").

## Intelligence flow

1. `app.js` builds the context with **`buildIntelligenceContext()`** (the only context builder), using runtime values from the session, the detector and the recommendation. It sends no raw event stream and no personal data. It contains `state` (`no_session` / `observing` / `session_ended` / `workflow_detected`), `about` (static truthful product facts), `session`, `executions` (id, invoice, actions, seconds), `workflow`, `recommendation` and `estimates` (`is_estimate: true`).
2. `VeridicoIntelligenceClient.ask()` → `POST {VERIDICO_API_URL}/api/intelligence` with `{ question, lang, session_id, context }`.
3. The backend validates and strips the context (Zod), then calls `POST {SON_INTELLIGENCE_URL}/v1/ask` with `Authorization: Bearer {SON_INTELLIGENCE_KEY}` and body `{ input, context, metadata: { session_id } }`. It never sends model, provider, temperature, tools or prompts.
4. On success the response is `{ output, provider: "son-intelligence", request_id }`.
5. When SON isn't configured, times out (`SON_INTELLIGENCE_TIMEOUT_MS`, default 10 s), is unavailable or returns a bad response, the backend returns `{ output: null, provider: "deterministic-demo", fallback: true, fallback_reason, request_id }`. The browser then answers with the existing `DemoIntelligenceProvider`, from the same context. If the backend itself is unreachable (or the browser's 13 s timeout fires), the same provider answers. The demo never shows an error.

Without a session (e.g. the `?q=` entry) the context has `state: "no_session"` and `workflow`, `recommendation` and `estimates` set to `null`. Answers can explain what Verídico is and how it works, but not report observed processes or savings. They offer "Experience this with a real workflow", which starts the observation session.

## Status system

Use `<span class="badge" data-status="…">` with one of `real`, `demo`, `connected`, `not_connected`, `planned`, `experimental`, `estimate`. Labels live in i18n under `status.*`.

## Leads

`POST {VERIDICO_API_URL}/api/leads` with `name, company, role, email, size, software, repetitive_process, let_veridico_discover, consent, lang, source, demo` (plus the `website` honeypot). When `LEADS_WEBHOOK_URL` is set the lead is forwarded and the response is `{ accepted: true }`. Otherwise the response is `{ accepted: false, fallback: true }` and the UI shows the email alternative. Leads are never kept in logs.

## Configuration

| Where | Variable | Notes |
|---|---|---|
| Railway (backend) | `NODE_ENV`, `PORT`, `SON_INTELLIGENCE_URL`, `SON_INTELLIGENCE_KEY`, `ALLOWED_ORIGINS`, `LEADS_WEBHOOK_URL` (+ optional `SON_INTELLIGENCE_TIMEOUT_MS`, `BODY_LIMIT_BYTES`) | The key exists only here. |
| Frontend | `VERIDICO_API_URL` in `assets/js/runtime-config.js` | Public URL. Also add its origin to `connect-src` in `vercel.json`. |

The legacy names `INTELLIGENCE_GATEWAY_URL` / `INTELLIGENCE_API_KEY` and the Vercel functions `api/intelligence.js` / `api/leads.js` were removed. There is no compatibility layer.

## P1 (next)

Richer animations, more workflows (e.g. document requests, approvals), an Overview dashboard, richer metrics, persisting the session across reloads (sessionStorage), translation polish, SON showcase.

## P2 — documented only, not implemented

- **Real ORDR integration:** an event stream from ORDR (webhooks or an event API) into the same `session.record()` contract.
- **CRM / ERP connectors:** per-system adapters that normalise native events into Verídico event types.
- **OS-wide observation:** a desktop agent capturing application-level events (consent, privacy and works-council requirements first).
- **Multi-company production:** tenants, data isolation and retention policies.
- **Enterprise auth:** SSO (SAML/OIDC), roles, audit log.
- **Advanced process mining:** long-horizon observation (days, weeks, months), variant analysis, conformance checking.
- **Advanced ML:** learned similarity, anomaly and exception detection, confidence calibration.
- **Autonomous execution:** approved workflows executed by Verídico, with human checkpoints and rollback.
- **Billing:** licence plus Intelligence Capacity metering.
