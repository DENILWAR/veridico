// /api/intelligence — abstract Verídico Intelligence route (Vercel serverless function).
//
// The browser never talks to an LLM vendor. This route forwards the request to a single
// configurable gateway (future: SON Intelligence, shared by Santos and Verídico).
//
//   INTELLIGENCE_GATEWAY_URL  gateway endpoint (POST, JSON). Unset → 503, client falls back
//                             to the deterministic demo provider.
//   INTELLIGENCE_API_KEY      optional bearer token for the gateway.
//
// Request  (POST): { question: string, lang: 'en'|'es'|'de', context: IntelligenceContext }
// Gateway receives: { product: 'veridico', question, lang, context }
// Gateway returns : { answer: string, provider?: string, actions?: string[] }
// Response        : { answer, provider, actions }
// GET → { configured: boolean } (lets the UI show CONNECTED / NOT CONNECTED honestly).

const MAX_QUESTION = 2000;
const MAX_CONTEXT_BYTES = 64 * 1024;
const LANGS = ['en', 'es', 'de'];

module.exports = async function handler(req, res) {
  const url = process.env.INTELLIGENCE_GATEWAY_URL;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({ configured: Boolean(url) });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!url) {
    return res.status(503).json({ error: 'gateway_not_configured', provider: 'none' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ error: 'invalid_json' }); }
  }
  const question = body && typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION) : '';
  if (!question) return res.status(400).json({ error: 'question_required' });
  const lang = LANGS.includes(body.lang) ? body.lang : 'en';
  const context = body.context && typeof body.context === 'object' ? body.context : {};
  if (JSON.stringify(context).length > MAX_CONTEXT_BYTES) return res.status(413).json({ error: 'context_too_large' });

  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  if (process.env.INTELLIGENCE_API_KEY) headers.authorization = `Bearer ${process.env.INTELLIGENCE_API_KEY}`;

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ product: 'veridico', question, lang, context }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return res.status(502).json({ error: 'gateway_error', status: r.status });
    const data = await r.json();
    if (!data || typeof data.answer !== 'string') return res.status(502).json({ error: 'gateway_bad_response' });
    return res.status(200).json({
      answer: data.answer,
      provider: typeof data.provider === 'string' ? data.provider : 'son-intelligence',
      actions: Array.isArray(data.actions) ? data.actions.filter((a) => typeof a === 'string') : [],
    });
  } catch (e) {
    return res.status(504).json({ error: 'gateway_unreachable' });
  }
};
