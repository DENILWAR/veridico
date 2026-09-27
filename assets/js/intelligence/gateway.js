// Verídico Intelligence — gateway abstraction.
//
// UI components never talk to an LLM vendor. They call VeridicoIntelligenceClient, which only
// talks to the abstract route /api/intelligence (to be routed by SON Intelligence later).
// If that route is not configured or unreachable, the DemoIntelligenceProvider answers the
// supported questions deterministically from real session data. It is labelled
// "deterministic-demo" and is never presented as an LLM.
import { t, fmtNumber, fmtDuration } from '../i18n.js';

/**
 * @typedef {Object} IntelligenceContext
 * @property {'veridico'} product
 * @property {'demo'} environment
 * @property {Object} session         status, counts, threshold
 * @property {Array}  executions      completed executions (steps, actions, duration)
 * @property {Object|null} detection  recurring workflow, if detected
 * @property {Object|null} recommendation automation + role evolution (estimates flagged)
 *
 * @typedef {Object} IntelligenceRequest
 * @property {string} question
 * @property {'en'|'es'|'de'} lang
 * @property {IntelligenceContext} context
 *
 * @typedef {Object} IntelligenceResponse
 * @property {string} answer
 * @property {string} provider        e.g. "son-intelligence" or "deterministic-demo"
 * @property {string} [intent]
 * @property {string[]} [actions]     UI actions the answer suggests (start, workflows, …)
 *
 * @typedef {Object} IntelligenceGateway
 * @property {(request: IntelligenceRequest) => Promise<IntelligenceResponse>} ask
 */

/** @implements {IntelligenceGateway} */
export class VeridicoIntelligenceClient {
  constructor({ endpoint, fallback, timeoutMs = 12000 }) {
    this.endpoint = endpoint;
    this.fallback = fallback;
    this.timeoutMs = timeoutMs;
    this.gatewayAvailable = null; // unknown until probed
  }

  async status() {
    try {
      const r = await fetch(this.endpoint, { method: 'GET', headers: { accept: 'application/json' } });
      const j = r.ok ? await r.json() : null;
      this.gatewayAvailable = !!(j && j.configured);
    } catch (e) {
      this.gatewayAvailable = false;
    }
    return { connected: this.gatewayAvailable, provider: this.gatewayAvailable ? 'gateway' : this.fallback.name };
  }

  /** @param {IntelligenceRequest} request */
  async ask(request) {
    if (this.gatewayAvailable === false) return this.fallback.ask(request);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const r = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(request),
        signal: ctrl.signal,
      });
      if (!r.ok) {
        if ([404, 405, 501, 503].includes(r.status)) this.gatewayAvailable = false;
        return this.fallback.ask(request);
      }
      const j = await r.json();
      if (!j || typeof j.answer !== 'string' || !j.answer.trim()) return this.fallback.ask(request);
      this.gatewayAvailable = true;
      return { answer: j.answer, provider: j.provider || 'son-intelligence', actions: j.actions || [] };
    } catch (e) {
      this.gatewayAvailable = false;
      return this.fallback.ask(request);
    } finally {
      clearTimeout(timer);
    }
  }
}

/* ─── Deterministic demo provider ────────────────────────────────────────── */

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,;:]/g, ' ');

// Order matters: first match wins.
const INTENTS = [
  ['how', ['how does', 'how do you', 'how you detect', 'como detect', 'como funciona', 'como sabe', 'wie erkenn', 'wie funktioniert', 'wie findet']],
  ['time', ['how much time', 'save', 'hours', 'time', 'tiempo', 'ahorr', 'horas', 'zeit', 'spar', 'stunden']],
  ['focus', ['focus', 'instead', 'worker', 'role', 'employee', 'enfoc', 'centrar', 'en lugar', 'trabajador', 'rol ', 'empleado', 'konzentr', 'stattdessen', 'mitarbeit', 'rolle']],
  ['why', ['why', 'reason', 'recommend', 'por que', 'porque', 'recomiend', 'motivo', 'warum', 'empfiehl', 'empfehl', 'grund']],
  ['show', ['show', 'happened', 'timeline', 'events', 'muestr', 'que paso', 'ha pasado', 'eventos', 'zeig', 'passiert', 'ereignis', 'ablauf']],
  ['automate', ['should my company automate', 'what should', 'automatizar mi', 'deberia automatizar', 'que deberia', 'was sollte', 'automatisieren sollte']],
  ['detected', ['repetitive', 'detect', 'found', 'pattern', 'repetitiv', 'detect', 'encontr', 'patron', 'wiederhol', 'erkannt', 'gefunden', 'muster']],
];

export function classify(question) {
  const q = ` ${norm(question)} `;
  for (const [intent, keys] of INTENTS) if (keys.some((k) => q.includes(k))) return intent;
  return 'unknown';
}

export const SUGGESTED_QUESTIONS = ['chat.q.detected', 'chat.q.why', 'chat.q.show', 'chat.q.time', 'chat.q.focus'];

/** @implements {IntelligenceGateway} */
export class DemoIntelligenceProvider {
  constructor() { this.name = 'deterministic-demo'; }

  /** @param {IntelligenceRequest} request */
  async ask({ question, context }) {
    const intent = classify(question);
    const { answer, actions } = this.answer(intent, context);
    await new Promise((r) => setTimeout(r, 450)); // brief, honest "working" state; no fake streaming
    return { answer, actions, intent, provider: this.name };
  }

  answer(intent, ctx) {
    const s = ctx.session;
    const d = ctx.detection;
    const r = ctx.recommendation;
    const wf = d ? t(`workflow.${d.workflow}`) : '';
    const list = (keys, prefix) => keys.map((k) => t(`${prefix}.${k}`).toLowerCase()).join(', ');

    if (intent === 'how') return { answer: t('chat.a.how', { threshold: s.threshold }), actions: s.status === 'idle' ? ['start'] : [] };

    if (intent === 'automate' && !d) return { answer: t('chat.a.automate_generic'), actions: ['start'] };

    if (s.status === 'idle') {
      return { answer: intent === 'unknown' ? t('chat.a.unknown_idle') : t('chat.a.no_session'), actions: ['start'] };
    }
    if (!d) {
      return {
        answer: t('chat.a.observing', { events: s.events, done: s.completedExecutions, threshold: s.threshold }),
        actions: ['session'],
      };
    }

    const sim = fmtNumber(d.similarity * 100);
    const dur = fmtDuration(d.avgDurationMs);
    switch (intent) {
      case 'detected':
        return {
          answer: t('chat.a.detected', { workflow: wf, n: d.size, sim, dur, actions: fmtNumber(d.avgActions) }),
          actions: ['workflows'],
        };
      case 'why':
        return {
          answer: t('chat.a.why', {
            workflow: wf, n: d.size, sim,
            steps: d.steps.map((c) => t(`step.${c}`)).join(' → '),
            repetitive: r.repetitiveSteps, total: d.steps.length,
          }) + (r.exceptionsObserved ? '\n\n' + t('chat.a.why_exceptions', { n: r.exceptionsObserved }) : ''),
          actions: ['recommendations'],
        };
      case 'show': {
        const lines = ctx.executions.map((e) => t('chat.a.show_line', {
          id: e.id, invoice: e.invoiceId, actions: e.actions, dur: fmtDuration(e.durationMs),
        }));
        return {
          answer: [t('chat.a.show_intro', { events: s.events }), ...lines, t('chat.a.show_outro', { n: d.size, workflow: wf })].join('\n'),
          actions: ['workflows'],
        };
      }
      case 'time':
        return {
          answer: t('chat.a.time', {
            dur, volume: fmtNumber(r.estimate.monthlyVolume),
            hours: fmtNumber(r.estimate.recoverableHoursPerMonth, 1),
            manual: fmtNumber(r.estimate.manualHoursPerMonth, 1),
          }),
          actions: ['recommendations'],
        };
      case 'focus':
        return { answer: t('chat.a.focus', { focus: list(r.focus, 'focus') }), actions: ['recommendations'] };
      case 'automate':
        return {
          answer: t('chat.a.automate_detected', { workflow: wf, caps: list(r.automate.filter((a) => !a.suggested).map((a) => a.key), 'cap'), human: list(r.human, 'human') }),
          actions: ['recommendations'],
        };
      default:
        return { answer: t('chat.a.unknown'), actions: [] };
    }
  }
}

/** Build the context sent to any IntelligenceGateway. Only session data; no PII. */
export function buildContext({ session, detection, recommendation, config }) {
  return {
    product: 'veridico',
    environment: 'demo',
    session: {
      status: session.status,
      events: session.events.length,
      completedExecutions: session.completed().length,
      threshold: config.DEMO_THRESHOLD,
      durationMs: session.startedAt ? (session.endedAt || Date.now()) - session.startedAt : 0,
    },
    executions: session.completed().map((e) => ({
      id: e.id, invoiceId: e.invoiceId, actions: e.events.length, durationMs: e.endedAt - e.startedAt,
      events: e.events.map((ev) => ev.type),
    })),
    detection: detection && {
      workflow: detection.workflowKey,
      size: detection.size,
      similarity: detection.similarity,
      avgDurationMs: detection.avgDurationMs,
      avgActions: detection.avgActions,
      steps: detection.steps.map((s) => s.code),
      variants: detection.variants,
      method: 'deterministic-sequence-similarity',
    },
    recommendation: recommendation && {
      automate: recommendation.automate,
      human: recommendation.human,
      focus: recommendation.focus,
      repetitiveSteps: recommendation.repetitiveSteps,
      automatableShare: recommendation.automatableShare,
      potential: recommendation.potential,
      exceptionsObserved: recommendation.exceptionsObserved,
      estimate: { ...recommendation.estimate, isEstimate: true, basis: 'observed_avg_duration x assumed_monthly_volume' },
    },
  };
}
