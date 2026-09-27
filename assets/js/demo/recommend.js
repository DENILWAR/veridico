import { STEP_OF } from './detector.js';

// Turns a detected workflow into an automation recommendation + role-evolution estimate.
// Every projected figure is an ESTIMATE derived from observed durations and an explicit,
// user-editable monthly-volume assumption.

// Which automation capability would cover each observed step.
const CAPABILITY_OF = {
  READ_INVOICE: 'extract_fields',
  SEARCH_CLIENT: 'detect_client',
  SELECT_CLIENT: 'detect_client',
  CLASSIFY: 'classify_document',
  CHANGE_STATUS: 'update_status',
  CREATE_TASK: 'create_task',
  SAVE: 'update_fields',
  OPEN_FILE: 'process_document',
  OPEN_TOOL: 'process_document',
  PROCESS_DOCUMENT: 'process_document',
};
// Pure navigation between screens: disappears when the workflow is automated.
const NAVIGATION = new Set(['OPEN_INVOICE', 'RETURN_QUEUE']);

const HUMAN = ['validate_exceptions', 'approve_ambiguous', 'communicate_client', 'make_decisions'];
const FOCUS = ['exceptions', 'client_communication', 'validation', 'decision_making'];

export function recommend(detection, session, monthlyVolume) {
  if (!detection) return null;
  const automate = [];
  const byCap = {};
  detection.steps.forEach((s) => {
    const cap = CAPABILITY_OF[s.code];
    if (!cap) return;
    if (!byCap[cap]) { byCap[cap] = { key: cap, from: [] }; automate.push(byCap[cap]); }
    byCap[cap].from.push(s.code);
  });
  // Not observed as a step, but a natural completion of this workflow. Flagged as suggested.
  automate.push({ key: 'prepare_confirmation', from: [], suggested: true });

  const repetitive = detection.steps.filter((s) => CAPABILITY_OF[s.code] || NAVIGATION.has(s.code));
  const share = detection.steps.length ? repetitive.length / detection.steps.length : 0;

  // Exceptions actually observed in this session (tax ID mismatch on client selection).
  const exceptions = session.events.filter((e) => e.type === 'crm.client.select' && e.data.taxMatch === false).length;

  const potential = share >= 0.6 && detection.similarity >= 0.85 ? 'high' : share >= 0.4 ? 'medium' : 'low';

  return {
    automate,
    human: HUMAN,
    focus: FOCUS,
    repetitiveSteps: repetitive.length,
    automatableShare: share,
    exceptionsObserved: exceptions,
    potential,
    estimate: estimate(detection, share, monthlyVolume),
  };
}

export function estimate(detection, share, monthlyVolume) {
  const perRunH = detection.avgDurationMs / 3.6e6;
  return {
    monthlyVolume,
    manualHoursPerMonth: perRunH * monthlyVolume,
    recoverableHoursPerMonth: perRunH * share * monthlyVolume,
  };
}

/** Session-level metrics for the summary. Counts come from the session; hours are estimates. */
export function summarize(session, detection, rec) {
  // Repetitive actions: events of the detected executions that belong to the workflow's
  // consensus steps (variants and navigation after saving are excluded).
  const detected = detection ? new Set(detection.executionIds) : new Set();
  const core = new Set(detection ? detection.steps.map((s) => s.code) : []);
  let repetitiveActions = 0;
  session.executions.forEach((ex) => {
    if (!detected.has(ex.id)) return;
    ex.events.forEach((ev) => {
      const s = STEP_OF[ev.type];
      if (s && core.has(s) && (CAPABILITY_OF[s] || NAVIGATION.has(s))) repetitiveActions++;
    });
  });
  return {
    events: session.events.length,
    executions: session.completed().length,
    recurring: detection ? 1 : 0,
    repetitiveActions,
    potential: rec ? rec.potential : null,
    recoverableHours: rec ? rec.estimate.recoverableHoursPerMonth : null,
    durationMs: (session.endedAt || Date.now()) - (session.startedAt || Date.now()),
  };
}

