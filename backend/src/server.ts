import { loadConfig, sonConfigured } from './config.js';
import { buildApp } from './app.js';

const config = loadConfig();
const app = await buildApp(config);

app.log.info({
  env: config.nodeEnv,
  son_intelligence_configured: sonConfigured(config),
  son_timeout_ms: config.sonIntelligence.timeoutMs,
  allowed_origins: config.allowedOrigins,
  leads_webhook_configured: Boolean(config.leadsWebhookUrl),
}, 'veridico-backend configuration');

const close = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void close('SIGTERM'));
process.on('SIGINT', () => void close('SIGINT'));

await app.listen({ port: config.port, host: '0.0.0.0' });
