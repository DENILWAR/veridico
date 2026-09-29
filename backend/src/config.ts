import { z } from 'zod';

// Canonical production origin of the Verídico frontend. Always allowed.
export const CANONICAL_ORIGIN = 'https://veridico.son.enterprises';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['production', 'development', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SON_INTELLIGENCE_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  SON_INTELLIGENCE_KEY: z.string().min(1).optional().or(z.literal('').transform(() => undefined)),
  SON_INTELLIGENCE_TIMEOUT_MS: z.coerce.number().int().min(500).max(60000).default(10000),
  ALLOWED_ORIGINS: z.string().default(''),
  LEADS_WEBHOOK_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).max(1024 * 1024).default(64 * 1024),
  INTELLIGENCE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(20),
  INTELLIGENCE_DAILY_LIMIT: z.coerce.number().int().min(1).max(1_000_000).default(2000),
  LEADS_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(5),
});

export interface Config {
  nodeEnv: 'production' | 'development' | 'test';
  isProduction: boolean;
  port: number;
  sonIntelligence: { url?: string; key?: string; timeoutMs: number };
  allowedOrigins: string[];
  leadsWebhookUrl?: string;
  bodyLimitBytes: number;
  limits: { intelligencePerMinute: number; intelligencePerDay: number; leadsPerMinute: number };
}

function normalizeOrigin(o: string): string {
  return o.trim().replace(/\/+$/, '');
}

/** Parse and validate environment variables. Throws on invalid configuration. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = EnvSchema.parse(env);
  const isProduction = e.NODE_ENV === 'production';

  const configured = e.ALLOWED_ORIGINS.split(',').map(normalizeOrigin).filter(Boolean);
  if (configured.includes('*')) {
    if (isProduction) throw new Error('ALLOWED_ORIGINS must not contain "*" in production');
  }
  for (const o of configured) {
    if (o !== '*' && !/^https?:\/\/[^/\s]+$/.test(o)) throw new Error(`ALLOWED_ORIGINS contains an invalid origin: ${o}`);
  }
  const allowedOrigins = Array.from(new Set([CANONICAL_ORIGIN, ...configured]));

  return {
    nodeEnv: e.NODE_ENV,
    isProduction,
    port: e.PORT,
    sonIntelligence: {
      url: e.SON_INTELLIGENCE_URL?.replace(/\/+$/, ''),
      key: e.SON_INTELLIGENCE_KEY,
      timeoutMs: e.SON_INTELLIGENCE_TIMEOUT_MS,
    },
    allowedOrigins,
    leadsWebhookUrl: e.LEADS_WEBHOOK_URL,
    bodyLimitBytes: e.BODY_LIMIT_BYTES,
    limits: {
      intelligencePerMinute: e.INTELLIGENCE_RATE_LIMIT_PER_MINUTE,
      intelligencePerDay: e.INTELLIGENCE_DAILY_LIMIT,
      leadsPerMinute: e.LEADS_RATE_LIMIT_PER_MINUTE,
    },
  };
}

export function sonConfigured(c: Config): boolean {
  return Boolean(c.sonIntelligence.url && c.sonIntelligence.key);
}
