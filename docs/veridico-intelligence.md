# Verídico Intelligence — landing + interactive demo

Static site on Vercel (no build step). ES modules in `assets/js`, serverless functions in `api/`.

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
| `assets/js/intelligence/gateway.js` | `IntelligenceGateway`, `VeridicoIntelligenceClient`, `DemoIntelligenceProvider`. |
| `api/intelligence.js` | Abstract route → `INTELLIGENCE_GATEWAY_URL`. |
| `api/leads.js` | "Analyze my company" → `LEADS_WEBHOOK_URL` or function log. |

## Run locally

```bash
python3 -m http.server 8765   # ES modules need http://, not file://
```

`/api/*` doesn't exist on a plain static server. The chat falls back to the deterministic demo provider, and the lead form shows its fallback message (email). Use `vercel dev` to exercise the functions.

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

## Intelligence gateway contract

The browser calls only `/api/intelligence`.

- `GET` → `{ configured: boolean }`. This drives the CONNECTED / NOT CONNECTED badge.
- `POST { question, lang, context }` → the function forwards `{ product: 'veridico', question, lang, context }` to `INTELLIGENCE_GATEWAY_URL` (with `Authorization: Bearer INTELLIGENCE_API_KEY` when set).
- The gateway must answer `{ answer: string, provider?: string, actions?: string[] }`. Supported `actions`: `start`, `session`, `workflows`, `recommendations`, `explore`.

`context` is built by `buildContext()`. It contains session counts, completed executions (event types, action counts, durations), the detection and the recommendation. Estimates are flagged with `isEstimate: true`. It contains no personal data.

If the gateway is unset, fails or times out, `DemoIntelligenceProvider` (`provider: "deterministic-demo"`) answers the supported intents from session data. The UI labels every answer with its provider.

## Status system

Use `<span class="badge" data-status="…">` with one of `real`, `demo`, `connected`, `not_connected`, `planned`, `experimental`, `estimate`. Labels live in i18n under `status.*`.

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
