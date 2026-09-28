import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { status: 'ok', service: 'veridico-backend' };
  });
}
