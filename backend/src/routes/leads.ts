import type { FastifyInstance } from 'fastify';
import { LeadRequestSchema } from '../schemas/leads.js';

// POST /api/leads — "Analyze my company".
// LEADS_WEBHOOK_URL set   → forward the validated lead; { accepted: true }.
// LEADS_WEBHOOK_URL unset → { accepted: false, fallback: true } so the UI offers the email alternative.
// Leads are never "stored" in logs; only non-personal outcome lines are logged.
export function leadsRoutes(webhookUrl: string | undefined, fetchImpl: typeof fetch = fetch, perMinute = 5) {
  return async function (app: FastifyInstance) {
    app.post('/api/leads', { config: { rateLimit: { max: perMinute, timeWindow: '1 minute' } } }, async (req, reply) => {
      reply.header('Cache-Control', 'no-store');
      const lead = LeadRequestSchema.parse(req.body);

      // Honeypot filled → bot. Pretend success, forward nothing.
      if (lead.website && lead.website.trim()) return { accepted: true };

      if (!webhookUrl) {
        req.log.warn('lead not delivered: LEADS_WEBHOOK_URL not configured');
        reply.code(503);
        return { accepted: false, fallback: true };
      }

      const { website: _hp, ...payload } = lead;
      try {
        const r = await fetchImpl(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'veridico.lead',
            ...payload,
            repetitive_process: payload.let_veridico_discover ? '' : payload.repetitive_process,
            received_at: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) throw new Error(`webhook status ${r.status}`);
        req.log.info('lead delivered');
        return { accepted: true };
      } catch (err) {
        req.log.error({ err: (err as Error).message }, 'lead delivery failed');
        reply.code(502);
        return { accepted: false, fallback: true };
      }
    });
  };
}
