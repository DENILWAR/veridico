import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { detectedContext, noSessionContext, testConfig, SON_ENV } from './fixtures.js';

const ORIGIN = 'https://veridico.son.enterprises';
const ask = (context = detectedContext, question = 'Why are you recommending this?') =>
  ({ method: 'POST' as const, url: '/api/intelligence', headers: { origin: ORIGIN }, payload: { question, lang: 'en', session_id: 'sess_123', context } });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('health & ready', () => {
  it('GET /health', async () => {
    const app = await buildApp(testConfig(), { logger: false });
    const r = await app.inject({ method: 'GET', url: '/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: 'ok', service: 'veridico-backend' });
  });

  it('GET /ready → 503 when SON Intelligence is not configured', async () => {
    const app = await buildApp(testConfig(), { logger: false });
    const r = await app.inject({ method: 'GET', url: '/ready' });
    expect(r.statusCode).toBe(503);
    expect(r.json().checks).toEqual({ son_intelligence: false, allowed_origins: true, leads_webhook: false });
  });

  it('GET /ready → 200 when configured, without calling SON Intelligence', async () => {
    const fetchImpl = vi.fn();
    const app = await buildApp(testConfig(SON_ENV), { logger: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = await app.inject({ method: 'GET', url: '/ready' });
    expect(r.statusCode).toBe(200);
    expect(r.json().status).toBe('ready');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r.body).not.toContain('test-key-not-real');
  });
});

describe('POST /api/intelligence', () => {
  it('SON Intelligence success → provider son-intelligence, exact request contract', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ output: 'Observed 3 times at 94% similarity.', request_id: 'son-req-1', model: 'hidden' }));
    const app = await buildApp(testConfig(SON_ENV), { logger: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = await app.inject(ask());
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.json()).toEqual({ output: 'Observed 3 times at 94% similarity.', provider: 'son-intelligence', request_id: 'son-req-1' });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://son.example.com/v1/ask');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key-not-real');
    expect(headers['Content-Type']).toBe('application/json');
    const sent = JSON.parse(init.body as string);
    expect(Object.keys(sent).sort()).toEqual(['context', 'input', 'metadata']);
    expect(sent.input).toBe('Why are you recommending this?');
    expect(sent.metadata).toEqual({ session_id: 'sess_123' });
    expect(sent.context.workflow.occurrences).toBe(3);
    for (const k of ['product', 'model', 'provider', 'temperature', 'tools', 'system_prompt']) expect(sent).not.toHaveProperty(k);
  });

  it('strips unknown context fields before forwarding', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ output: 'ok' }));
    const app = await buildApp(testConfig(SON_ENV), { logger: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    const ctx = { ...detectedContext, raw_events: [{ type: 'crm.invoice.open' }], session: { ...detectedContext.session, secret: 'x' } };
    const r = await app.inject(ask(ctx as never));
    expect(r.statusCode).toBe(200);
    const sent = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.context).not.toHaveProperty('raw_events');
    expect(sent.context.session).not.toHaveProperty('secret');
  });

  it('SON Intelligence unavailable (503) → deterministic-demo fallback', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'down' }, 503));
    const app = await buildApp(testConfig(SON_ENV), { logger: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = await app.inject(ask());
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ output: null, provider: 'deterministic-demo', fallback: true, fallback_reason: 'unavailable' });
  });

  it('SON Intelligence network error → deterministic-demo fallback', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed'); });
    const app = await buildApp(testConfig(SON_ENV), { logger: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = await app.inject(ask());
    expect(r.json()).toMatchObject({ provider: 'deterministic-demo', fallback_reason: 'unavailable' });
  });

  it('SON Intelligence timeout → deterministic-demo fallback', async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_res, rej) => {
      init.signal?.addEventListener('abort', () => rej(init.signal?.reason ?? new DOMException('timeout', 'TimeoutError')));
    }));
    const app = await buildApp(testConfig({ ...SON_ENV, SON_INTELLIGENCE_TIMEOUT_MS: '600' }), { logger: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    const t0 = Date.now();
    const r = await app.inject(ask());
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(r.json()).toMatchObject({ provider: 'deterministic-demo', fallback_reason: 'timeout' });
  });

  it('SON Intelligence bad response (empty output) → deterministic-demo fallback', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ nothing: true }));
    const app = await buildApp(testConfig(SON_ENV), { logger: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = await app.inject(ask());
    expect(r.json()).toMatchObject({ provider: 'deterministic-demo', fallback_reason: 'bad_response' });
  });

  it('not configured → deterministic-demo fallback (no-session context accepted)', async () => {
    const app = await buildApp(testConfig(), { logger: false });
    const r = await app.inject(ask(noSessionContext, 'What should my company automate?'));
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ output: null, provider: 'deterministic-demo', fallback_reason: 'not_configured' });
  });

  it('invalid body → 400 without echoing values', async () => {
    const app = await buildApp(testConfig(), { logger: false });
    const r = await app.inject({ method: 'POST', url: '/api/intelligence', payload: { question: '', context: { state: 'nope' } } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('invalid_request');
    expect(r.body).not.toContain('nope');
  });

  it('oversized body → 413', async () => {
    const app = await buildApp(testConfig({ BODY_LIMIT_BYTES: '4096' }), { logger: false });
    const r = await app.inject({ ...ask(), payload: { question: 'x'.repeat(5000), context: detectedContext } });
    expect(r.statusCode).toBe(413);
    expect(r.json()).toEqual({ error: 'payload_too_large' });
  });
});

describe('CORS & security headers', () => {
  it('allows the canonical and configured origins', async () => {
    const app = await buildApp(testConfig(), { logger: false });
    for (const origin of [ORIGIN, 'https://preview.example.com']) {
      const r = await app.inject({ method: 'OPTIONS', url: '/api/intelligence', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
      expect(r.headers['access-control-allow-origin']).toBe(origin);
    }
  });

  it('does not allow other origins', async () => {
    const app = await buildApp(testConfig(), { logger: false });
    const r = await app.inject({ method: 'OPTIONS', url: '/api/intelligence', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects wildcard origins in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS: '*' })).toThrow();
  });

  it('sets basic security headers', async () => {
    const app = await buildApp(testConfig(), { logger: false });
    const r = await app.inject({ method: 'GET', url: '/health' });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['strict-transport-security']).toBeDefined();
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
  });
});

describe('POST /api/leads', () => {
  const lead = { name: 'Ana', company: 'Acme', role: 'COO', email: 'ANA@acme.test', size: '11-50', software: 'ORDR', repetitive_process: 'Invoices', consent: true };

  it('no webhook → accepted:false, fallback:true', async () => {
    const app = await buildApp(testConfig(), { logger: false });
    const r = await app.inject({ method: 'POST', url: '/api/leads', payload: lead });
    expect(r.json()).toEqual({ accepted: false, fallback: true });
  });

  it('webhook configured → forwards and accepts', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }));
    const app = await buildApp(testConfig({ LEADS_WEBHOOK_URL: 'https://hooks.example.com/lead' }), { logger: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = await app.inject({ method: 'POST', url: '/api/leads', payload: { ...lead, website: '' } });
    expect(r.json()).toEqual({ accepted: true });
    const sent = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.email).toBe('ana@acme.test');
    expect(sent).not.toHaveProperty('website');
  });

  it('webhook failure → accepted:false, fallback:true', async () => {
    const fetchImpl = vi.fn(async () => new Response('no', { status: 500 }));
    const app = await buildApp(testConfig({ LEADS_WEBHOOK_URL: 'https://hooks.example.com/lead' }), { logger: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = await app.inject({ method: 'POST', url: '/api/leads', payload: lead });
    expect(r.json()).toEqual({ accepted: false, fallback: true });
  });

  it('invalid email / missing consent → 400', async () => {
    const app = await buildApp(testConfig(), { logger: false });
    expect((await app.inject({ method: 'POST', url: '/api/leads', payload: { ...lead, email: 'nope' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/leads', payload: { ...lead, consent: false } })).statusCode).toBe(400);
  });

  it('honeypot → silently accepted, not forwarded', async () => {
    const fetchImpl = vi.fn();
    const app = await buildApp(testConfig({ LEADS_WEBHOOK_URL: 'https://hooks.example.com/lead' }), { logger: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = await app.inject({ method: 'POST', url: '/api/leads', payload: { ...lead, website: 'http://spam' } });
    expect(r.json()).toEqual({ accepted: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('abuse protection', () => {
  it('rate limits /api/intelligence per client (429 after the limit)', async () => {
    const app = await buildApp(testConfig({ INTELLIGENCE_RATE_LIMIT_PER_MINUTE: '3' }), { logger: false });
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await app.inject({ ...ask(), headers: { origin: ORIGIN, 'x-real-ip': '203.0.113.7' } })).statusCode);
    expect(codes).toEqual([200, 200, 200, 429]);
    const other = await app.inject({ ...ask(), headers: { origin: ORIGIN, 'x-real-ip': '203.0.113.8' } });
    expect(other.statusCode).toBe(200);
    const limited = await app.inject({ ...ask(), headers: { origin: ORIGIN, 'x-real-ip': '203.0.113.7' } });
    expect(limited.json()).toMatchObject({ error: 'rate_limited' });
  });

  it('daily budget exhausted → deterministic-demo without calling SON', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ output: 'ok' }));
    const app = await buildApp(testConfig({ ...SON_ENV, INTELLIGENCE_DAILY_LIMIT: '2' }), { logger: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    const r1 = await app.inject(ask()); const r2 = await app.inject(ask()); const r3 = await app.inject(ask());
    expect(r1.json().provider).toBe('son-intelligence');
    expect(r2.json().provider).toBe('son-intelligence');
    expect(r3.json()).toMatchObject({ provider: 'deterministic-demo', fallback_reason: 'budget_exhausted' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects model/prompt/tool fields in the request (strict schema)', async () => {
    const app = await buildApp(testConfig(SON_ENV), { logger: false });
    for (const extra of [{ system_prompt: 'x' }, { model: 'gpt' }, { tools: [] }, { instructions: 'x' }]) {
      const r = await app.inject({ ...ask(), payload: { question: 'q', lang: 'en', context: detectedContext, ...extra } });
      expect(r.statusCode).toBe(400);
    }
  });

  it('forwards demo_generated execution markers', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ output: 'ok' }));
    const app = await buildApp(testConfig(SON_ENV), { logger: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    const ctx = { ...detectedContext, session: { ...detectedContext.session, demo_generated_executions: 2 },
      executions: detectedContext.executions.map((e, i) => ({ ...e, demo_generated: i > 0 })) };
    await app.inject(ask(ctx));
    const sent = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.context.session.demo_generated_executions).toBe(2);
    expect(sent.context.executions.map((e: { demo_generated?: boolean }) => e.demo_generated)).toEqual([false, true, true]);
  });

  it('rate limits /api/leads', async () => {
    const app = await buildApp(testConfig({ LEADS_RATE_LIMIT_PER_MINUTE: '1' }), { logger: false });
    const lead = { name: 'A', company: 'B', email: 'a@b.co', consent: true };
    expect((await app.inject({ method: 'POST', url: '/api/leads', payload: lead })).statusCode).toBe(503);
    expect((await app.inject({ method: 'POST', url: '/api/leads', payload: lead })).statusCode).toBe(429);
  });
});
