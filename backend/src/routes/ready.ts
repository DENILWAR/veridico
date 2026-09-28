import type { FastifyInstance } from 'fastify';
import { sonConfigured, type Config } from '../config.js';

// Configuration readiness only: never calls SON Intelligence or OpenAI. Exposes booleans, not values.
export function readyRoutes(config: Config) {
  return async function (app: FastifyInstance) {
    app.get('/ready', async (_req, reply) => {
      const checks = {
        son_intelligence: sonConfigured(config),
        allowed_origins: config.allowedOrigins.length > 0 && !(config.isProduction && config.allowedOrigins.includes('*')),
        leads_webhook: Boolean(config.leadsWebhookUrl),
      };
      // Leads webhook is optional (the UI shows an email alternative); the gateway and CORS are critical.
      const ready = checks.son_intelligence && checks.allowed_origins;
      reply.header('Cache-Control', 'no-store');
      reply.code(ready ? 200 : 503);
      return { status: ready ? 'ready' : 'not_ready', service: 'veridico-backend', checks };
    });
  };
}
