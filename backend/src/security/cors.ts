import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

// Explicit allow-list. `*` is only accepted outside production (rejected by config in production).
export async function registerCors(app: FastifyInstance, allowedOrigins: string[]) {
  const allowAll = allowedOrigins.includes('*');
  const allowed = new Set(allowedOrigins);
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, false);            // non-browser clients: no CORS headers needed
      cb(null, allowAll || allowed.has(origin));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    credentials: false,
    maxAge: 600,
  });
}
