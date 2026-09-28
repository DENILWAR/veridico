// The operational truth is computed in the browser (session, events, deterministic detection,
// recommendation) and packed by the single builder `buildIntelligenceContext()` in
// assets/js/intelligence/gateway.js. The backend never trusts it blindly: this module validates
// it against a strict schema, strips unknown fields and bounds sizes before it is forwarded
// to SON Intelligence. No raw event stream and no personal data are accepted.
import { IntelligenceContextSchema, type IntelligenceContext } from '../schemas/intelligence.js';

export function normalizeIntelligenceContext(raw: unknown): IntelligenceContext {
  return IntelligenceContextSchema.parse(raw);
}

/** Safe, non-sensitive summary for logs (never log the full context). */
export function contextLogSummary(ctx: IntelligenceContext) {
  return {
    state: ctx.state,
    events: ctx.session.event_count,
    executions: ctx.session.workflow_executions,
    workflow: ctx.workflow?.key ?? null,
  };
}
