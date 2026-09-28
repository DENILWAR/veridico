import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { sonConfigured, type Config } from './config.js';
import { registerCors } from './security/cors.js';
import { registerSecurityHeaders } from './security/headers.js';
import { SonIntelligenceClient } from './intelligence/son-intelligence-client.js';
import { healthRoutes } from './routes/health.js';
import { readyRoutes } from './routes/ready.js';
import { intelligenceRoutes } from './routes/intelligence.js';
import { leadsRoutes } from './routes/leads.js';

export interface AppDeps {
  fetchImpl?: typeof fetch;
  logger?: boolean;
}

export async function buildApp(config: Config, deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: config.bodyLimitBytes,
    trustProxy: true,
    logger: deps.logger === false ? false : {
      level: config.isProduction ? 'info' : 'debug',
      // Never log secrets or request bodies (the context is not logged; only summaries).
      redact: ['req.headers.authorization', 'req.headers.cookie', 'headers.authorization'],
    },
  });

  registerSecurityHeaders(app, config.isProduction);
  await registerCors(app, config.allowedOrigins);

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send({ error: 'invalid_request', issues: err.issues.map((i) => ({ path: i.path.join('.'), code: i.code })) });
      return;
    }
    const status = err.statusCode ?? 500;
    if (status >= 500) req.log.error({ err: err.message }, 'unhandled error');
    const code = status === 413 ? 'payload_too_large' : status === 415 ? 'unsupported_media_type' : status < 500 ? 'bad_request' : 'internal_error';
    // Production errors never include stack traces or internal messages.
    reply.code(status).send(config.isProduction || status >= 500 ? { error: code } : { error: code, message: err.message });
  });
  app.setNotFoundHandler((_req, reply) => { reply.code(404).send({ error: 'not_found' }); });

  const son = sonConfigured(config)
    ? new SonIntelligenceClient({
        baseUrl: config.sonIntelligence.url!,
        apiKey: config.sonIntelligence.key!,
        timeoutMs: config.sonIntelligence.timeoutMs,
        fetchImpl: deps.fetchImpl,
      })
    : null;

  await app.register(healthRoutes);
  await app.register(readyRoutes(config));
  await app.register(intelligenceRoutes(son));
  await app.register(leadsRoutes(config.leadsWebhookUrl, deps.fetchImpl ?? fetch));
  return app;
}
