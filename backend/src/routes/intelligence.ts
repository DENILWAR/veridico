import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { IntelligenceRequestSchema, type IntelligenceResponse } from '../schemas/intelligence.js';
import { normalizeIntelligenceContext, contextLogSummary } from '../intelligence/context-builder.js';
import { deterministicFallback } from '../intelligence/deterministic-provider.js';
import { SonIntelligenceClient, SonIntelligenceError } from '../intelligence/son-intelligence-client.js';
import type { DailyBudget } from '../security/rate-limit.js';

// POST /api/intelligence
// Try SON Intelligence → success: provider=son-intelligence.
// Not configured / timeout / unavailable / bad response → provider=deterministic-demo (never an error screen).
// Per-client rate limit (429 → the frontend answers with deterministic-demo) and a global daily
// budget of SON Intelligence calls (exhausted → deterministic-demo directive).
export function intelligenceRoutes(son: SonIntelligenceClient | null, opts: { perMinute: number; budget: DailyBudget }) {
  return async function (app: FastifyInstance) {
    app.post('/api/intelligence', { config: { rateLimit: { max: opts.perMinute, timeWindow: '1 minute' } } }, async (req, reply): Promise<IntelligenceResponse> => {
      reply.header('Cache-Control', 'no-store');
      const body = IntelligenceRequestSchema.parse(req.body);
      const context = normalizeIntelligenceContext(body.context);
      const requestId = randomUUID();
      reply.header('X-Request-Id', requestId);

      if (!son) {
        req.log.info({ request_id: requestId, fallback: 'not_configured', ctx: contextLogSummary(context) }, 'intelligence fallback');
        return deterministicFallback(requestId, 'not_configured');
      }
      if (!opts.budget.take()) {
        req.log.warn({ request_id: requestId, fallback: 'budget_exhausted' }, 'intelligence daily budget exhausted');
        return deterministicFallback(requestId, 'budget_exhausted');
      }
      try {
        const res = await son.ask({ input: body.question, context, sessionId: body.session_id, requestId });
        req.log.info({ request_id: res.requestId, provider: 'son-intelligence', ctx: contextLogSummary(context) }, 'intelligence answered');
        return { output: res.output, provider: 'son-intelligence', request_id: res.requestId };
      } catch (err) {
        const reason = err instanceof SonIntelligenceError ? err.kind : 'unavailable';
        const status = err instanceof SonIntelligenceError ? err.status : undefined;
        req.log.warn({ request_id: requestId, fallback: reason, upstream_status: status }, 'intelligence fallback');
        return deterministicFallback(requestId, reason);
      }
    });
  };
}
