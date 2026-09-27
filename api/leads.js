// /api/leads — "Analyze my company" requests (Vercel serverless function).
//
// No CRM is wired yet. The endpoint validates the request and hands it to a single,
// replaceable sink:
//   LEADS_WEBHOOK_URL  set   → POST the lead as JSON to that webhook (CRM, automation, mail relay…)
//   LEADS_WEBHOOK_URL unset  → write a structured line to the function log (visible in Vercel logs)
// Swap `deliver()` for a database or CRM client when one exists.

const LIMITS = { name: 120, company: 160, role: 120, email: 200, size: 20, software: 200, process: 2000 };
const SIZES = ['', '1-10', '11-50', '51-200', '201-1000', '1000+'];

function clean(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }

async function deliver(lead) {
  const hook = process.env.LEADS_WEBHOOK_URL;
  if (hook) {
    const r = await fetch(hook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(lead),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`webhook ${r.status}`);
    return 'webhook';
  }
  console.log('[veridico-lead]', JSON.stringify(lead));
  return 'log';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { return res.status(400).json({ error: 'invalid_json' }); } }
  b = b || {};

  // Honeypot: bots fill hidden fields. Pretend success, store nothing.
  if (typeof b.website === 'string' && b.website.trim()) return res.status(200).json({ ok: true });

  const lead = {
    name: clean(b.name, LIMITS.name),
    company: clean(b.company, LIMITS.company),
    role: clean(b.role, LIMITS.role),
    email: clean(b.email, LIMITS.email).toLowerCase(),
    size: SIZES.includes(b.size) ? b.size : '',
    software: clean(b.software, LIMITS.software),
    process: b.unknown ? '' : clean(b.process, LIMITS.process),
    letVeridicoDiscover: Boolean(b.unknown),
    consent: b.consent === true,
    lang: ['en', 'es', 'de'].includes(b.lang) ? b.lang : 'en',
    source: clean(b.source, 60) || 'veridico-demo',
    demo: b.demo && typeof b.demo === 'object' ? {
      events: Number(b.demo.events) || 0,
      executions: Number(b.demo.executions) || 0,
      recurring: Number(b.demo.recurring) || 0,
      workflow: clean(b.demo.workflow, 60) || null,
    } : null,
    receivedAt: new Date().toISOString(),
  };

  if (!lead.name || !lead.company || !lead.email) return res.status(400).json({ error: 'missing_fields' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return res.status(400).json({ error: 'invalid_email' });
  if (!lead.consent) return res.status(400).json({ error: 'consent_required' });

  try {
    const via = await deliver(lead);
    return res.status(200).json({ ok: true, via });
  } catch (e) {
    console.error('[veridico-lead] delivery failed', e.message);
    return res.status(502).json({ error: 'delivery_failed' });
  }
};
