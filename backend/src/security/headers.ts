import type { FastifyInstance } from 'fastify';

// Basic security headers for a JSON API. No custom crypto.
export function registerSecurityHeaders(app: FastifyInstance, isProduction: boolean) {
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (isProduction) reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    reply.removeHeader('X-Powered-By');
    return payload;
  });
}
