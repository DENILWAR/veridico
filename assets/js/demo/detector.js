// Deterministic recurring-workflow detector (no ML).
// 1. Map each execution's events to canonical steps; collapse consecutive repeats.
//    Pure navigation after the save (crm.queue.return) is recorded but not compared.
// 2. Compare executions pairwise with an LCS similarity ratio (tolerates small insertions).
// 3. Group the largest set of mutually similar executions.
// 4. If the group reaches DEMO_THRESHOLD → recurring workflow; rebuild its consensus steps.

export const STEP_OF = {
  'crm.invoice.open': 'OPEN_INVOICE',
  'crm.invoice.read': 'READ_INVOICE',
  'crm.client.search': 'SEARCH_CLIENT',
  'crm.client.select': 'SELECT_CLIENT',
  'crm.invoice.classify': 'CLASSIFY',
  'crm.invoice.status_change': 'CHANGE_STATUS',
  'crm.task.create': 'CREATE_TASK',
  'crm.task.update': 'CREATE_TASK',
  'crm.invoice.save': 'SAVE',
  'files.document.open': 'OPEN_FILE',
  'browser.tool.open': 'OPEN_TOOL',
  'browser.document.process': 'PROCESS_DOCUMENT',
};

export function toSteps(execution) {
  const out = [];
  execution.events.forEach((ev) => {
    const s = STEP_OF[ev.type];
    if (s && out[out.length - 1] !== s) out.push(s);
  });
  return out;
}

function lcs(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

export function similarity(a, b) {
  if (!a.length && !b.length) return 1;
  return (2 * lcs(a, b)) / (a.length + b.length);
}

function mean(xs) { return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0; }

/**
 * @param {Array} executions completed executions
 * @param {{DEMO_THRESHOLD:number, SIMILARITY_MIN:number, STEP_MAJORITY:number}} cfg
 * @returns detection or null
 */
export function detect(executions, cfg) {
  const items = executions.map((e) => ({ exec: e, steps: toSteps(e) })).filter((x) => x.steps.length >= 3);
  if (items.length < cfg.DEMO_THRESHOLD) return null;

  // Largest group of executions similar to a seed.
  let best = [];
  items.forEach((seed) => {
    const group = items.filter((x) => similarity(seed.steps, x.steps) >= cfg.SIMILARITY_MIN);
    if (group.length > best.length) best = group;
  });
  if (best.length < cfg.DEMO_THRESHOLD) return null;

  // Pairwise similarity inside the group.
  const sims = [];
  for (let i = 0; i < best.length; i++) {
    for (let j = i + 1; j < best.length; j++) sims.push(similarity(best[i].steps, best[j].steps));
  }

  // Consensus: steps present in a majority of executions, ordered by mean relative position.
  const stats = {};
  best.forEach(({ exec, steps }) => {
    const firstTs = {};
    exec.events.forEach((ev) => { const s = STEP_OF[ev.type]; if (s && firstTs[s] == null) firstTs[s] = ev.ts; });
    const seen = new Set();
    steps.forEach((s, idx) => {
      if (seen.has(s)) return;
      seen.add(s);
      const st = stats[s] || (stats[s] = { code: s, count: 0, pos: [], ts: [] });
      st.count++;
      st.pos.push(steps.length > 1 ? idx / (steps.length - 1) : 0);
      st.ts.push({ exec: exec.id, t: firstTs[s] - exec.startedAt });
    });
  });
  const all = Object.values(stats).map((s) => ({ ...s, avgPos: mean(s.pos) }));
  const n = best.length;
  const steps = all.filter((s) => s.count / n > cfg.STEP_MAJORITY).sort((a, b) => a.avgPos - b.avgPos);
  const extra = all.filter((s) => s.count / n <= cfg.STEP_MAJORITY).sort((a, b) => a.avgPos - b.avgPos);

  // Average time from workflow start to each consensus step (for the reconstruction view).
  steps.forEach((s) => { s.avgAtMs = mean(s.ts.map((x) => x.t)); });

  const variants = [
    ...extra.map((s) => ({ code: s.code, kind: 'extra', count: s.count, total: n })),
    ...steps.filter((s) => s.count < n).map((s) => ({ code: s.code, kind: 'skipped', count: n - s.count, total: n })),
  ];

  const execs = best.map((x) => x.exec);
  return {
    workflowKey: dominantEntity(execs) === 'invoice' ? 'invoice_processing' : 'generic',
    executionIds: execs.map((e) => e.id),
    executions: execs.map((e) => ({ id: e.id, invoiceId: e.invoiceId, steps: toSteps(e), actions: e.events.length, durationMs: e.endedAt - e.startedAt })),
    size: n,
    similarity: sims.length ? mean(sims) : 1,
    steps: steps.map((s) => ({ code: s.code, count: s.count, total: n, avgAtMs: s.avgAtMs })),
    variants,
    avgDurationMs: mean(execs.map((e) => e.endedAt - e.startedAt)),
    avgActions: mean(execs.map((e) => e.events.length)),
    detectedAt: Date.now(),
  };
}

function dominantEntity(execs) {
  const c = {};
  execs.forEach((e) => e.events.forEach((ev) => { if (ev.entity) c[ev.entity.type] = (c[ev.entity.type] || 0) + 1; }));
  return Object.keys(c).sort((a, b) => c[b] - c[a])[0];
}
