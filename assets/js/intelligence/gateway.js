// Verídico Intelligence — the single Intelligence client of the frontend.
//
// Browser → Verídico backend (VERIDICO_API_URL/api/intelligence) → SON Intelligence Gateway.
// The frontend never talks to SON Intelligence or any model vendor, and never holds a key.
//
// Verídico builds the operational truth (buildIntelligenceContext). SON Intelligence reasons
// about it. When the backend answers with the deterministic-demo directive (SON not configured,
// timeout, unavailable) — or the backend itself is unreachable — DemoIntelligenceProvider answers
// the supported questions from the same context. It is labelled "deterministic-demo" and is never
// presented as an LLM.
import { t, fmtNumber, fmtDuration } from '../i18n.js';

/**
 * @typedef {Object} IntelligenceRequest
 * @property {string} question
 * @property {'en'|'es'|'de'} lang
 * @property {string} [session_id]
 * @property {Object} context   output of buildIntelligenceContext()
 *
 * @typedef {Object} IntelligenceResponse
 * @property {string} answer
 * @property {'son-intelligence'|'deterministic-demo'} provider
 * @property {string} [requestId]
 * @property {string[]} [actions]
 *
 * @typedef {Object} IntelligenceGateway
 * @property {(request: IntelligenceRequest) => Promise<IntelligenceResponse>} ask
 */

/** @implements {IntelligenceGateway} */
export class VeridicoIntelligenceClient {
  constructor({ endpoint, readyEndpoint, fallback, timeoutMs = 13000 }) {
    this.endpoint = endpoint;           // '' → no backend configured: deterministic-demo only
    this.readyEndpoint = readyEndpoint;
    this.fallback = fallback;
    this.timeoutMs = timeoutMs;
    this.gatewayAvailable = null;       // last known: did SON Intelligence answer?
  }

  /** Readiness of backend + SON Intelligence (configuration only; no model call). */
  async status() {
    if (!this.readyEndpoint) { this.gatewayAvailable = false; return { connected: false }; }
    try {
      const r = await fetch(this.readyEndpoint, { method: 'GET', headers: { accept: 'application/json' } });
      const j = await r.json();
      this.gatewayAvailable = !!(j && j.checks && j.checks.son_intelligence);
    } catch (e) {
      this.gatewayAvailable = false;
    }
    return { connected: this.gatewayAvailable };
  }

  /** @param {IntelligenceRequest} request */
  async ask(request) {
    if (!this.endpoint) return this.local(request);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const r = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ question: request.question, lang: request.lang, session_id: request.session_id, context: request.context }),
        signal: ctrl.signal,
      });
      const j = r.ok ? await r.json() : null;
      if (j && j.provider === 'son-intelligence' && typeof j.output === 'string' && j.output.trim()) {
        this.gatewayAvailable = true;
        return { answer: j.output, provider: 'son-intelligence', requestId: j.request_id, actions: [] };
      }
      if (j && j.fallback) this.gatewayAvailable = false;
      return this.local(request, j && j.request_id);
    } catch (e) {
      return this.local(request); // backend unreachable / timeout → the demo never breaks
    } finally {
      clearTimeout(timer);
    }
  }

  async local(request, requestId) {
    const res = await this.fallback.ask(request);
    return { ...res, requestId };
  }
}

/* ─── Single context builder ─────────────────────────────────────────────── */

// Static, truthful facts so questions without a session can be answered without inventing
// observations. Kept short on purpose.
const ABOUT = {
  product: 'Verídico Intelligence',
  what_it_is: 'Operational intelligence that observes how a team works, detects repetitive workflows and recommends what to automate. A human always decides what is automated; people keep exceptions and decisions.',
  how_it_works: [
    'Every user action in the demo environment becomes an event (open invoice, search client, classify document, change status, create task, save).',
    'Events are grouped into workflow executions.',
    'Executions are compared by their sequence of steps with a deterministic similarity measure (no machine learning in this demo).',
    'When enough similar executions are observed, Verídico reports a recurring workflow, reconstructs it and recommends an automation with estimated impact.',
    'How to use the demo: start the observation session; in ORDR open an invoice, search and select its client, classify it, change its status, create or update the follow-up task and save; repeat with similar invoices until the recurrence threshold is reached. A "demo fast-forward" option can simulate the remaining interactions; such executions are marked demo_generated.',
    'All numbers in session, executions, workflow, recommendation and estimates are computed deterministically by Verídico from this demo session. Estimates are projections based on an assumed monthly volume, not measurements of any real company.',
  ],
  demo_environment: 'Interactive demo with a fictitious company (Nova Administration S.L.) processing supplier invoices in the ORDR demo CRM, SON Files and SON Browser. Nothing is connected to real company systems.',
  not_available: [
    'Production integrations with ORDR, CRMs, ERPs or email are planned, not connected.',
    'Without an observation session there are no observed processes, savings or detected workflows.',
  ],
};

const r1 = (x) => Math.round(x * 10) / 10;
const r3 = (x) => Math.round(x * 1000) / 1000;
const secs = (ms) => r1(Math.max(0, ms) / 1000);

/**
 * Converts Verídico's runtime state into the small, structured package sent to Intelligence.
 * Uses only values computed at runtime (session, detector, recommendation); nothing is hardcoded.
 * No raw event stream, no personal data.
 */
export function buildIntelligenceContext({ session, detection, recommendation, config, lang }) {
  const done = session.completed();
  const state = detection ? 'workflow_detected'
    : session.status === 'idle' ? 'no_session'
    : session.status === 'ended' ? 'session_ended' : 'observing';
  return {
    state,
    language: lang,
    about: ABOUT,
    session: {
      status: session.status,
      event_count: session.events.length,
      workflow_executions: done.length,
      recurrence_threshold: config.DEMO_THRESHOLD,
      duration_seconds: session.startedAt ? secs((session.endedAt || Date.now()) - session.startedAt) : 0,
      demo_generated_executions: done.filter((e) => e.demoGenerated).length,
    },
    executions: done.slice(-50).map((e) => ({
      id: e.id,
      invoice_id: e.invoiceId || null,
      actions: e.events.length,
      duration_seconds: secs(e.endedAt - e.startedAt),
      demo_generated: !!e.demoGenerated,
    })),
    workflow: detection ? {
      key: detection.workflowKey,
      name: t(`workflow.${detection.workflowKey}`),
      occurrences: detection.size,
      similarity: r3(detection.similarity),
      average_duration_seconds: secs(detection.avgDurationMs),
      average_actions: r1(detection.avgActions),
      steps: detection.steps.map((s) => t(`step.${s.code}`)),
      variants: detection.variants.map((v) => ({ step: t(`step.${v.code}`), kind: v.kind, executions: v.count, of: v.total })),
      detection_method: 'deterministic_sequence_similarity',
    } : null,
    recommendation: recommendation ? {
      automation_potential: recommendation.potential,
      automatable_steps: recommendation.automate.filter((a) => !a.suggested).map((a) => t(`cap.${a.key}`)),
      suggested_additions: recommendation.automate.filter((a) => a.suggested).map((a) => t(`cap.${a.key}`)),
      human_steps: recommendation.human.map((h) => t(`human.${h}`)),
      focus_areas: recommendation.focus.map((f) => t(`focus.${f}`)),
      repetitive_steps: recommendation.repetitiveSteps,
      total_steps: detection ? detection.steps.length : 0,
      exceptions_observed: recommendation.exceptionsObserved,
    } : null,
    estimates: recommendation ? {
      is_estimate: true,
      basis: 'observed average duration per execution × assumed monthly volume × share of repetitive steps',
      assumed_monthly_volume: recommendation.estimate.monthlyVolume,
      manual_hours_per_month: r1(recommendation.estimate.manualHoursPerMonth),
      recoverable_hours_per_month: r1(recommendation.estimate.recoverableHoursPerMonth),
    } : null,
  };
}

/* ─── Deterministic demo provider (fallback) ─────────────────────────────── */

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,;:]/g, ' ');

// Order matters: first match wins.
const INTENTS = [
  ['next', ['what do i do', 'what should i do', 'what now', 'next', 'guide', 'que hago', 'que debo hacer', 'siguiente', 'guia', 'was soll ich', 'was mache ich', 'nachste', 'fuhr mich', 'anleitung']],
  ['repeat', ['why do i need to repeat', 'why repeat', 'repeat the', 'por que repetir', 'por que tengo que repetir', 'repetir el', 'warum wiederholen', 'warum muss ich', 'wiederholen']],
  ['how', ['how does', 'how do you', 'how you detect', 'will you be observ', 'what will you observ', 'como detect', 'como funciona', 'como sabe', 'que vas a observ', 'wie erkenn', 'wie funktioniert', 'wie findet', 'was wirst du beobacht']],
  ['human', ['stay human', 'remain human', 'human', 'humano', 'personas', 'mensch']],
  ['time', ['how much time', 'save', 'hours', 'time', 'impact', 'tiempo', 'ahorr', 'horas', 'impacto', 'zeit', 'spar', 'stunden', 'auswirkung']],
  ['focus', ['focus', 'instead', 'worker', 'role', 'employee', 'enfoc', 'centrar', 'en lugar', 'trabajador', 'rol ', 'empleado', 'konzentr', 'stattdessen', 'mitarbeit', 'rolle']],
  ['why', ['why', 'reason', 'recommend', 'por que', 'porque', 'recomiend', 'motivo', 'warum', 'empfiehl', 'empfehl', 'grund']],
  ['show', ['show', 'happened', 'timeline', 'events', 'observed so far', 'so far', 'muestr', 'que paso', 'ha pasado', 'eventos', 'hasta ahora', 'zeig', 'passiert', 'ereignis', 'ablauf', 'bisher']],
  ['about', ['what is', 'what does', 'what can', 'who are', 'que es', 'que hace', 'que puede', 'was ist', 'was macht', 'was kann']],
  ['automate', ['should my company automate', 'what should', 'automate first', 'would you automate', 'automatizar mi', 'deberia automatizar', 'que deberia', 'automatizarias', 'was sollte', 'automatisieren sollte', 'zuerst automatis']],
  ['detected', ['repetitive', 'detect', 'found', 'pattern', 'repetitiv', 'encontr', 'patron', 'wiederhol', 'erkannt', 'gefunden', 'muster']],
];

export function classify(question) {
  const q = ` ${norm(question)} `;
  for (const [intent, keys] of INTENTS) if (keys.some((k) => q.includes(k))) return intent;
  return 'unknown';
}

// Contextual quick prompts (i18n keys), selected by the deterministic demo state.
export const SUGGESTED_QUESTIONS = {
  no_session: ['chat.q.how_demo', 'chat.q.what_is', 'chat.q.guide', 'chat.q.observe_what'],
  observing: ['chat.q.observed_so_far', 'chat.q.next', 'chat.q.why_repeat'],
  session_ended: ['chat.q.observed_so_far', 'chat.q.what_is', 'chat.q.how_demo'],
  workflow_detected: ['chat.q.why', 'chat.q.first', 'chat.q.human', 'chat.q.impact', 'chat.q.explain_wf'],
};

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
    const d = ctx.workflow;
    const r = ctx.recommendation;
    const e = ctx.estimates;
    const lower = (xs) => xs.map((x) => x.toLowerCase()).join(', ');

    if (intent === 'how') return { answer: t('chat.a.how', { threshold: s.recurrence_threshold }), actions: s.status === 'idle' ? ['guide', 'start'] : [] };
    if (intent === 'repeat') return { answer: t('chat.a.repeat', { threshold: s.recurrence_threshold }), actions: s.status === 'observing' && !d ? ['session'] : [] };
    if (intent === 'next') {
      if (s.status === 'idle') return { answer: t('chat.a.next_idle', { threshold: s.recurrence_threshold }), actions: ['guide', 'start', 'fastforward'] };
      if (d) return { answer: t('chat.a.next_detected', { workflow: d.name, n: d.occurrences }), actions: ['metrics'] };
      if (s.status === 'ended') return { answer: t('chat.a.next_ended'), actions: ['start'] };
      const left = Math.max(1, s.recurrence_threshold - s.workflow_executions);
      return { answer: t(s.workflow_executions ? 'chat.a.next_more' : 'chat.a.next_first', { done: s.workflow_executions, left, threshold: s.recurrence_threshold }), actions: ['session', 'fastforward'] };
    }
    if (intent === 'about') {
      // The generic "what is Verídico" answer states nothing has been observed: only valid without a session.
      if (s.status === 'idle') return { answer: t('chat.a.about', { threshold: s.recurrence_threshold }), actions: ['start'] };
      intent = d ? 'detected' : 'observing';
    }
    if (intent === 'automate' && !d) return { answer: t('chat.a.automate_generic'), actions: ['start'] };

    if (s.status === 'idle') {
      return { answer: intent === 'unknown' ? t('chat.a.unknown_idle') : t('chat.a.no_session'), actions: ['start'] };
    }
    if (!d) {
      return {
        answer: t('chat.a.observing', { events: s.event_count, done: s.workflow_executions, threshold: s.recurrence_threshold }),
        actions: ['session'],
      };
    }

    const sim = fmtNumber(d.similarity * 100);
    const dur = fmtDuration(d.average_duration_seconds * 1000);
    switch (intent) {
      case 'detected':
        return {
          answer: t('chat.a.detected', { workflow: d.name, n: d.occurrences, sim, dur, actions: fmtNumber(d.average_actions) }),
          actions: ['workflows'],
        };
      case 'why':
        return {
          answer: t('chat.a.why', {
            workflow: d.name, n: d.occurrences, sim,
            steps: d.steps.join(' → '),
            repetitive: r.repetitive_steps, total: r.total_steps,
          }) + (r.exceptions_observed ? '\n\n' + t('chat.a.why_exceptions', { n: r.exceptions_observed }) : ''),
          actions: ['recommendations'],
        };
      case 'show': {
        const lines = ctx.executions.map((x) => t('chat.a.show_line', {
          id: x.id, invoice: x.invoice_id, actions: x.actions, dur: fmtDuration(x.duration_seconds * 1000),
        }));
        return {
          answer: [t('chat.a.show_intro', { events: s.event_count }), ...lines, t('chat.a.show_outro', { n: d.occurrences, workflow: d.name })].join('\n'),
          actions: ['workflows'],
        };
      }
      case 'time':
        return {
          answer: t('chat.a.time', {
            dur, volume: fmtNumber(e.assumed_monthly_volume),
            hours: fmtNumber(e.recoverable_hours_per_month, 1),
            manual: fmtNumber(e.manual_hours_per_month, 1),
          }),
          actions: ['recommendations'],
        };
      case 'focus':
        return { answer: t('chat.a.focus', { focus: lower(r.focus_areas) }), actions: ['recommendations'] };
      case 'human':
        return { answer: t('chat.a.human', { human: lower(r.human_steps), caps: lower(r.automatable_steps) }) + (r.exceptions_observed ? '\n\n' + t('chat.a.why_exceptions', { n: r.exceptions_observed }) : ''), actions: ['recommendations'] };
      case 'automate':
        return {
          answer: t('chat.a.automate_detected', { workflow: d.name, caps: lower(r.automatable_steps), human: lower(r.human_steps) }),
          actions: ['recommendations'],
        };
      default:
        return { answer: t('chat.a.unknown'), actions: [] };
    }
  }
}
