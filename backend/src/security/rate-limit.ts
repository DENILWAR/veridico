import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';

// In-memory protection for the public demo (single instance, no Redis):
// - per-client limits on the public routes (registered per route via `config.rateLimit`);
// - a global daily budget for SON Intelligence calls (see DailyBudget).

/**
 * Client key: Railway's edge proxy sets X-Real-IP to the connecting client; fall back to the
 * socket/proxy-derived IP. The daily budget caps cost even if a key could be rotated.
 */
export function clientKey(req: FastifyRequest): string {
  const real = req.headers['x-real-ip'];
  const ip = (Array.isArray(real) ? real[0] : real) || req.ip;
  return String(ip).slice(0, 64);
}

export async function registerRateLimit(app: FastifyInstance) {
  await app.register(rateLimit, {
    global: false,                 // only routes that opt in via config.rateLimit
    keyGenerator: clientKey,
    addHeadersOnExceeding: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true },
    errorResponseBuilder: (_req, ctx) => ({ statusCode: 429, error: 'rate_limited', retry_after_seconds: Math.ceil(ctx.ttl / 1000) }),
  });
}

/** Global per-UTC-day counter of SON Intelligence calls. Resets at UTC midnight or on restart. */
export class DailyBudget {
  private day = '';
  private used = 0;
  constructor(private readonly limit: number, private readonly now: () => Date = () => new Date()) {}

  /** Returns true and counts the call if budget remains. */
  take(): boolean {
    const today = this.now().toISOString().slice(0, 10);
    if (today !== this.day) { this.day = today; this.used = 0; }
    if (this.used >= this.limit) return false;
    this.used++;
    return true;
  }
}
