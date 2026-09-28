// Verídico Intelligence — interactive demo orchestrator.
// Flow: Overview → Start Observation Session → desktop (ORDR / SON Files / SON Browser)
//       → events → executions → deterministic detection → The Moment → Workflows
//       → Recommendations (+ role evolution) → Intelligence chat → Summary → Analyze my company.
import { applyI18n, mountLangSwitcher, t, fmtNumber, fmtDuration, getLang } from '../i18n.js';
import { portalArrive } from '../portal.js';
import { DEMO_CONFIG as cfg } from './config.js';
import { ObservationSession, newId } from './session.js';
import { detect } from './detector.js';
import { recommend, summarize } from './recommend.js';
import { Desktop } from './desktop.js';
import { INVOICES, COMPANY } from './data.js';
import { createOrdr } from './apps/ordr.js';
import { createFiles } from './apps/files.js';
import { createBrowser } from './apps/browser.js';
import { VeridicoIntelligenceClient, DemoIntelligenceProvider, buildIntelligenceContext, SUGGESTED_QUESTIONS } from '../intelligence/gateway.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const pct = (x) => `${fmtNumber(x * 100)}%`;
const hours = (h) => `${fmtNumber(h, 1)} h/${t('unit.month')}`;

/* ─── State ──────────────────────────────────────────────────────── */
const session = new ObservationSession();
let detection = null;
let rec = null;
let volume = cfg.ESTIMATE_MONTHLY_VOLUME;
let momentShown = false;
let observerOpen = false;
let view = 'overview';
const unseen = { workflows: false, recommendations: false };
const chatLog = [];
let chatBusy = false;
let gateway = { connected: false };
const leadDraft = {};
let leadState = 'idle'; // idle | sending | sent | error

const params = new URLSearchParams(location.search);
const entryQuestion = (params.get('q') || '').trim().slice(0, 500);
const entrySource = params.get('source');
const narrowMq = window.matchMedia(`(max-width: ${cfg.MOBILE_BREAKPOINT - 1}px)`);
const isNarrow = () => narrowMq.matches;

const intelligence = new VeridicoIntelligenceClient({
  endpoint: cfg.INTELLIGENCE_ENDPOINT,
  readyEndpoint: cfg.READY_ENDPOINT,
  fallback: new DemoIntelligenceProvider(),
  timeoutMs: cfg.INTELLIGENCE_CLIENT_TIMEOUT_MS,
});
const pageSessionId = newId(); // used before an observation session exists (e.g. ?q= entry)

/* ─── Demo environment (desktop + apps) ──────────────────────────── */
const record = (type, opts) => session.record(type, opts);
let desktop = null;
const ordr = createOrdr({
  record,
  openFileFor: (id) => { desktop.open('files'); files.select(id); },
  onSaved: () => {},
});
const files = createFiles({ record, openInBrowser: (id) => { desktop.open('browser'); browser.load(id); } });
const browser = createBrowser({ record, onVerified: (id) => ordr.markVerified(id), returnToOrdr: () => desktop.open('ordr') });

function ensureDesktop() {
  if (desktop) return;
  desktop = new Desktop($('#desktop'), $('#dock'));
  desktop.register({
    id: 'ordr', title: 'ORDR', badgeKey: 'ordr.demo_crm', badgeStatus: 'demo', icon: 'O',
    geometry: (r) => ({ x: 16, y: 14, w: Math.min(1040, r.width - 32), h: Math.max(420, r.height - 96) }),
    mount: (b) => ordr.mount(b),
  });
  desktop.register({
    id: 'files', title: 'SON Files', icon: 'F',
    geometry: (r) => ({ x: Math.max(24, r.width - 470), y: 40, w: 450, h: 340 }),
    mount: (b) => files.mount(b),
  });
  desktop.register({
    id: 'browser', title: 'SON Browser', icon: 'B',
    geometry: (r) => ({ x: Math.max(24, r.width - 700), y: 110, w: 640, h: 400 }),
    mount: (b) => browser.mount(b),
  });
  desktop.register({
    id: 'veridico', title: 'Verídico', icon: 'V',
    geometry: () => ({ x: 0, y: 0, w: 0, h: 0 }),
    mount: () => {},
    dockAction: () => { observerOpen = !observerOpen; renderObserver(); },
  });
}

/* ─── Session lifecycle ──────────────────────────────────────────── */
function startSession() {
  session.start();
  detection = null; rec = null; momentShown = false;
  unseen.workflows = unseen.recommendations = false;
  observerOpen = false;
  ordr.reset();
  setView('session');
  ensureDesktop();
  desktop.open('ordr');
  renderAll();
}

function endSession() {
  session.end();
  hideMoment();
  setView('summary');
  renderAll();
}

session.addEventListener('event', () => { renderStatus(); scheduleObserver(); });
session.addEventListener('status', () => { renderStatus(); renderNav(); });
session.addEventListener('execution', () => {
  const d = detect(session.completed(), cfg);
  if (d) {
    const first = !detection;
    detection = d;
    rec = recommend(detection, session, volume);
    if (first) { unseen.workflows = unseen.recommendations = true; }
    if (!momentShown) {
      momentShown = true;
      setTimeout(showMoment, cfg.MOMENT_DELAY_MS); // let the save confirmation land first
    }
  }
  renderNav();
  if (view !== 'session') renderView(view);
});

/* ─── Top bar, nav, observer ─────────────────────────────────────── */
function renderStatus() {
  const box = $('#xpStatus');
  const obs = session.status === 'observing';
  box.hidden = session.status === 'idle';
  box.classList.toggle('ended', session.status === 'ended');
  $('#xpStatusLabel').textContent = obs ? t('xp.observing') : t('xp.session_ended');
  $('#xpEvents').textContent = t('xp.n_events', { n: session.events.length });
  $('#xpEnd').hidden = !obs;
  tickClock();
}
function tickClock() {
  if (!session.startedAt) return;
  const ms = (session.endedAt || Date.now()) - session.startedAt;
  const s = Math.floor(ms / 1000);
  $('#xpClock').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
setInterval(() => { if (session.status === 'observing') tickClock(); }, 1000);

function renderNav() {
  document.querySelectorAll('#xpNav [data-view]').forEach((b) => {
    const v = b.dataset.view;
    if (v === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    b.classList.toggle('live', v === 'session' && session.status === 'observing');
    b.classList.toggle('has-new', !!unseen[v]);
  });
  $('#navFoot').innerHTML = `<span>${esc(t('xp.threshold_label'))}</span><b>${cfg.DEMO_THRESHOLD}</b><small>${esc(t('xp.threshold_note'))}</small>`;
}

let observerQueued = false;
function scheduleObserver() {
  if (observerQueued) return;
  observerQueued = true;
  requestAnimationFrame(() => { observerQueued = false; renderObserver(); });
}
function renderObserver() {
  const el = $('#observer');
  if (session.status === 'idle') { el.innerHTML = ''; return; }
  const last = session.events.slice(-12).reverse();
  const time = (ts) => new Date(ts).toLocaleTimeString(getLang(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  el.innerHTML = `
    <button type="button" class="obs-pill ${session.status === 'observing' ? 'on' : ''}" aria-expanded="${observerOpen}" aria-controls="obsPanel">
      <span class="live-dot" aria-hidden="true"></span>
      <b>Verídico Intelligence</b>
      <span>${esc(session.status === 'observing' ? t('xp.observing') : t('xp.session_ended'))}</span>
      <span class="obs-count">${esc(t('xp.n_events', { n: session.events.length }))}</span>
    </button>
    <div class="obs-panel" id="obsPanel" ${observerOpen ? '' : 'hidden'}>
      <div class="obs-stats">
        <div><b>${session.events.length}</b><span>${esc(t('obs.events'))}</span></div>
        <div><b>${session.completed().length}</b><span>${esc(t('obs.executions'))}</span></div>
        <div><b>${detection ? 1 : 0}</b><span>${esc(t('obs.recurring'))}</span></div>
      </div>
      <ol class="obs-list" aria-label="${esc(t('obs.latest'))}">
        ${last.length ? last.map((e) => `<li><span class="mono t">${esc(time(e.ts))}</span><span class="mono ty">${esc(e.type.replace(/^(crm|files|browser)\./, ''))}</span><span class="mono id">${esc(e.entity ? e.entity.id.replace('INV-2026-', '#') : '')}</span></li>`).join('') : `<li class="muted">${esc(t('obs.none'))}</li>`}
      </ol>
      <p class="obs-foot">${esc(t('obs.foot'))}</p>
    </div>`;
  el.querySelector('.obs-pill').addEventListener('click', () => { observerOpen = !observerOpen; renderObserver(); });
  const pill = el.querySelector('.obs-pill');
  pill.classList.remove('tick'); void pill.offsetWidth; pill.classList.add('tick');
}

/* ─── The Moment ─────────────────────────────────────────────────── */
function showMoment() {
  if (!detection || view !== 'session' || isNarrow()) {
    // Not on the desktop right now: the nav marks Workflows as new instead.
    renderNav();
    return;
  }
  const el = $('#moment');
  el.hidden = false;
  el.innerHTML = `
    <div class="moment-card" role="dialog" aria-modal="true" aria-labelledby="momentTitle">
      <div class="m-k"><span class="live-dot" aria-hidden="true"></span>VERÍDICO INTELLIGENCE</div>
      <h2 id="momentTitle">${esc(t('moment.title'))}</h2>
      <div class="m-name">${esc(t(`workflow.${detection.workflowKey}`))}</div>
      <dl>
        <dt>${esc(t('metric.observed_executions'))}</dt><dd>${detection.size}</dd>
        <dt>${esc(t('metric.avg_actions'))}</dt><dd>${fmtNumber(detection.avgActions)}</dd>
        <dt>${esc(t('metric.avg_duration'))}</dt><dd>${esc(fmtDuration(detection.avgDurationMs))}</dd>
        <dt>${esc(t('metric.similarity'))}</dt><dd>${esc(pct(detection.similarity))}</dd>
      </dl>
      <p class="m-basis">${esc(t('moment.basis', { events: session.events.length }))}</p>
      <div class="m-act">
        <button type="button" class="btn btn-primary" data-m="review">${esc(t('moment.review'))} →</button>
        <button type="button" class="btn btn-ghost" data-m="keep">${esc(t('moment.keep'))}</button>
      </div>
    </div>`;
  el.querySelector('[data-m="review"]').addEventListener('click', () => { hideMoment(); setView('workflows'); });
  el.querySelector('[data-m="keep"]').addEventListener('click', hideMoment);
  el.querySelector('[data-m="review"]').focus();
}
function hideMoment() { const el = $('#moment'); el.hidden = true; el.innerHTML = ''; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#moment').hidden) hideMoment(); });

/* ─── Views ─────────────────────────────────────────────────────── */
function setView(v, { focus = false } = {}) {
  view = v;
  if (unseen[v]) unseen[v] = false;
  document.querySelectorAll('.view').forEach((s) => { s.hidden = s.dataset.view !== v; });
  renderNav();
  renderView(v);
  if (v === 'session') { ensureDesktopIfObserving(); }
  if (focus) { const h = $(`#view-${v} h1`); if (h) h.focus(); }
  $('#xpMain').scrollTop = 0;
}
function ensureDesktopIfObserving() {
  if (session.status !== 'idle' && !isNarrow()) ensureDesktop();
}

function renderView(v) {
  ({ overview: renderOverview, session: renderSession, workflows: renderWorkflows, recommendations: renderRecommendations,
    intelligence: renderIntelligence, sources: renderSources, summary: renderSummary })[v]();
}
function renderAll() {
  ['overview', 'session', 'workflows', 'recommendations', 'intelligence', 'sources', 'summary'].forEach(renderView);
  renderNav(); renderStatus(); renderObserver();
}

const heading = (kicker, title, extra = '') => `<header class="vh"><span class="kicker">${esc(kicker)}</span><h1 tabindex="-1">${esc(title)}</h1>${extra}</header>`;

function renderOverview() {
  const el = $('#view-overview');
  const pending = INVOICES.length;
  let main;
  if (session.status === 'observing') {
    main = `
      ${heading(t('ov.kicker_live'), t('ov.live_title'))}
      <div class="stat-row">
        <div class="stat"><b>${session.events.length}</b><span>${esc(t('obs.events'))}</span></div>
        <div class="stat"><b>${session.completed().length}</b><span>${esc(t('obs.executions'))}</span></div>
        <div class="stat"><b>${detection ? esc(t('ov.detected_yes')) : esc(t('ov.detected_no'))}</b><span>${esc(t('obs.recurring'))}</span></div>
      </div>
      <div class="row-btns"><button type="button" class="btn btn-primary" data-go="session">${esc(t('ov.return'))} →</button>
      ${detection ? `<button type="button" class="btn btn-ghost" data-go="workflows">${esc(t('moment.review'))}</button>` : ''}</div>`;
  } else if (session.status === 'ended') {
    main = `
      ${heading(t('ov.kicker_ended'), t('ov.ended_title'))}
      <div class="row-btns"><button type="button" class="btn btn-primary" data-go="summary">${esc(t('nav.summary'))} →</button>
      <button type="button" class="btn btn-ghost" data-start>${esc(t('ov.restart'))}</button></div>`;
  } else {
    main = `
      ${heading(t('ov.kicker'), t('ov.title'))}
      <p class="lead">${esc(t('ov.role', { company: COMPANY.name, n: pending }))}</p>
      <ol class="ov-steps">
        <li><b>${esc(t('ov.s1'))}</b><span>${esc(t('ov.s1d'))}</span></li>
        <li><b>${esc(t('ov.s2'))}</b><span>${esc(t('ov.s2d'))}</span></li>
        <li><b>${esc(t('ov.s3'))}</b><span>${esc(t('ov.s3d'))}</span></li>
      </ol>
      ${isNarrow() ? `
        <div class="narrow-box"><b>${esc(t('mobile.title'))}</b><p>${esc(t('mobile.text'))}</p>
        <div class="row-btns"><button type="button" class="btn btn-primary" data-go="intelligence">${esc(t('mobile.ask'))}</button><button type="button" class="btn btn-ghost" data-go="summary">${esc(t('final.cta'))}</button></div></div>`
      : `<div class="row-btns"><button type="button" class="btn btn-primary btn-lg" data-start>${esc(t('ov.start'))}</button></div>`}
      <p class="fine">${esc(t('ov.threshold', { n: cfg.DEMO_THRESHOLD }))}</p>
      <p class="fine">${esc(t('ov.privacy'))}</p>`;
  }
  el.innerHTML = `
    <div class="ov">
      <div class="ov-main">${main}</div>
      <aside class="ov-side card">
        <span class="card-k">${esc(t('ov.side_title'))}</span>
        <ol class="mini-flow">
          <li>${esc(t('cycle.observe'))}<small>${esc(t('ov.f1'))}</small></li>
          <li>${esc(t('cycle.detect'))}<small>${esc(t('ov.f2'))}</small></li>
          <li>${esc(t('ov.f3t'))}<small>${esc(t('ov.f3'))}</small></li>
          <li>${esc(t('cycle.recommend'))}<small>${esc(t('ov.f4'))}</small></li>
          <li class="human">${esc(t('ov.f5t'))}<small>${esc(t('ov.f5'))}</small></li>
        </ol>
        <div class="side-badges"><span class="badge" data-status="demo">ORDR · ${esc(t('status.demo'))}</span><span class="badge" data-status="planned">${esc(t('ov.prod_planned'))}</span></div>
      </aside>
    </div>`;
}

function renderSession() {
  const gate = $('#deskGate');
  const narrow = isNarrow();
  $('#view-session').classList.toggle('narrow', narrow);
  $('#mobileNote').innerHTML = narrow ? `
    <div class="narrow-box">
      <span class="kicker">${esc(t('nav.session'))}</span>
      <h1 tabindex="-1">${esc(t('mobile.title'))}</h1>
      <p>${esc(t('mobile.text'))}</p>
      <ol class="ov-steps compact"><li>${esc(t('mobile.s1'))}</li><li>${esc(t('mobile.s2'))}</li><li>${esc(t('mobile.s3'))}</li></ol>
      <div class="row-btns"><button type="button" class="btn btn-primary" data-go="intelligence">${esc(t('mobile.ask'))}</button><button type="button" class="btn btn-ghost" data-go="summary">${esc(t('final.cta'))}</button></div>
    </div>` : '';
  if (narrow) return;
  if (session.status === 'idle') {
    gate.hidden = false;
    gate.innerHTML = `<div class="gate-card"><span class="kicker">${esc(t('ov.kicker'))}</span><h1 tabindex="-1">${esc(t('gate.title'))}</h1><p>${esc(t('gate.text'))}</p><button type="button" class="btn btn-primary" data-start>${esc(t('ov.start'))}</button></div>`;
  } else if (session.status === 'ended') {
    gate.hidden = false;
    gate.innerHTML = `<div class="gate-card"><h1 tabindex="-1">${esc(t('ov.ended_title'))}</h1><div class="row-btns"><button type="button" class="btn btn-primary" data-go="summary">${esc(t('nav.summary'))} →</button><button type="button" class="btn btn-ghost" data-start>${esc(t('ov.restart'))}</button></div></div>`;
  } else {
    gate.hidden = true;
    gate.innerHTML = '';
  }
}

function waiting(kicker, title) {
  const done = session.completed().length;
  return `
    ${heading(kicker, title)}
    <div class="empty card">
      <p>${esc(session.status === 'idle' ? t('wf.empty_idle') : t('wf.empty_obs', { n: cfg.DEMO_THRESHOLD }))}</p>
      <div class="progress" role="img" aria-label="${esc(t('wf.progress', { done: Math.min(done, cfg.DEMO_THRESHOLD), n: cfg.DEMO_THRESHOLD }))}">
        ${Array.from({ length: cfg.DEMO_THRESHOLD }, (_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('')}
      </div>
      <small>${esc(t('wf.progress', { done: Math.min(done, cfg.DEMO_THRESHOLD), n: cfg.DEMO_THRESHOLD }))}</small>
      <div class="row-btns">${session.status === 'idle' ? `<button type="button" class="btn btn-primary" data-go="overview">${esc(t('ov.start'))}</button>` : `<button type="button" class="btn btn-primary" data-go="session">${esc(t('ov.return'))}</button>`}</div>
    </div>`;
}

function renderWorkflows() {
  const el = $('#view-workflows');
  if (!detection) { el.innerHTML = waiting(t('wf.kicker'), t('wf.title_empty')); return; }
  const d = detection;
  const variants = d.variants.length
    ? `<ul class="variants">${d.variants.map((v) => `<li><b>${esc(t(`step.${v.code}`))}</b><span>${esc(t(v.kind === 'extra' ? 'wf.var_extra' : 'wf.var_skipped', { k: v.count, n: v.total }))}</span></li>`).join('')}</ul>`
    : `<p class="muted">${esc(t('wf.no_variants'))}</p>`;
  el.innerHTML = `
    ${heading(t('wf.kicker'), t(`workflow.${d.workflowKey}`), `
      <div class="meta-row">
        <span class="badge" data-status="real">${esc(t('wf.from_session'))}</span>
        <span>${esc(t('wf.observed_n', { n: d.size }))}</span><span>·</span>
        <span>${esc(t('metric.avg_duration'))} ${esc(fmtDuration(d.avgDurationMs))}</span><span>·</span>
        <span>${esc(t('metric.avg_actions'))} ${fmtNumber(d.avgActions)}</span><span>·</span>
        <span>${esc(t('metric.similarity'))} ${esc(pct(d.similarity))}</span>
      </div>`)}
    <div class="wf-grid">
      <section class="card" aria-labelledby="wfSeqT">
        <span class="card-k" id="wfSeqT">${esc(t('wf.observed_workflow'))}</span>
        <ol class="seq">
          ${d.steps.map((s, i) => `
            <li><span class="n">${String(i + 1).padStart(2, '0')}</span>
              <div><b>${esc(t(`step.${s.code}`))}</b><small>${esc(t('wf.step_seen', { k: s.count, n: s.total }))} · ${esc(t('wf.step_at', { t: fmtDuration(s.avgAtMs) }))}</small></div></li>`).join('')}
        </ol>
      </section>
      <div class="stack">
        <section class="card">
          <span class="card-k">${esc(t('wf.variants'))}</span>
          ${variants}
        </section>
        <section class="card">
          <span class="card-k">${esc(t('wf.executions'))}</span>
          <table class="tbl small"><thead><tr><th>#</th><th>${esc(t('ordr.col_invoice'))}</th><th class="r">${esc(t('wf.actions'))}</th><th class="r">${esc(t('wf.duration'))}</th></tr></thead>
          <tbody>${d.executions.map((e) => `<tr><td>${e.id}</td><td class="mono">${esc(e.invoiceId)}</td><td class="r">${e.actions}</td><td class="r">${esc(fmtDuration(e.durationMs))}</td></tr>`).join('')}</tbody></table>
        </section>
        <section class="card method">
          <span class="card-k">${esc(t('wf.method_t'))}</span>
          <p>${esc(t('wf.method', { n: cfg.DEMO_THRESHOLD, sim: Math.round(cfg.SIMILARITY_MIN * 100) }))}</p>
        </section>
      </div>
    </div>
    <div class="row-btns end"><button type="button" class="btn btn-primary" data-go="recommendations">${esc(t('wf.to_rec'))} →</button></div>`;
}

function renderRecommendations() {
  const el = $('#view-recommendations');
  if (!detection || !rec) { el.innerHTML = waiting(t('rec.kicker'), t('rec.title_empty')); return; }
  const stepNames = (codes) => codes.map((c) => t(`step.${c}`)).join(', ');
  const e = rec.estimate;
  el.innerHTML = `
    ${heading(t('rec.kicker'), t('rec.title', { workflow: t(`workflow.${detection.workflowKey}`) }), `<div class="meta-row"><span class="badge" data-status="estimate">${esc(t('rec.badge'))}</span><span>${esc(t('rec.potential'))}: <b>${esc(t(`potential.${rec.potential}`))}</b></span></div>`)}
    <div class="rec-grid">
      <section class="card">
        <span class="card-k green">${esc(t('rec.automate_t'))}</span>
        <ul class="rec-list">
          ${rec.automate.map((a) => `<li><span class="ic auto" aria-hidden="true"></span><div><b>${esc(t(`cap.${a.key}`))}</b><small>${a.suggested ? esc(t('rec.suggested')) : esc(t('rec.from', { steps: stepNames(a.from) }))}</small></div></li>`).join('')}
        </ul>
      </section>
      <section class="card">
        <span class="card-k">${esc(t('rec.human_t'))}</span>
        <ul class="rec-list">
          ${rec.human.map((h) => `<li><span class="ic human" aria-hidden="true"></span><div><b>${esc(t(`human.${h}`))}</b></div></li>`).join('')}
        </ul>
        ${rec.exceptionsObserved ? `<p class="note">${esc(t('rec.exceptions', { n: rec.exceptionsObserved }))}</p>` : ''}
      </section>
    </div>

    <section class="card evo-card" aria-labelledby="evoT">
      <div class="evo-top"><span class="card-k green" id="evoT">${esc(t('evo2.title'))}</span><span class="badge" data-status="estimate">${esc(t('status.estimate'))}</span></div>
      <div class="evo-grid">
        <div class="evo-metrics">
          <div><span>${esc(t('evo2.steps'))}</span><b>${rec.repetitiveSteps}<small> / ${detection.steps.length}</small></b></div>
          <div><span>${esc(t('evo2.manual'))}</span><b>${esc(hours(e.manualHoursPerMonth))}</b></div>
          <div class="hi"><span>${esc(t('evo2.recoverable'))}</span><b>${esc(hours(e.recoverableHoursPerMonth))}</b></div>
          <label class="assume">${esc(t('evo2.assume_pre'))}
            <input type="number" id="volInput" min="10" max="100000" step="10" value="${volume}" />
            ${esc(t('evo2.assume_post', { dur: fmtDuration(detection.avgDurationMs), share: fmtNumber(rec.automatableShare * 100) }))}
          </label>
        </div>
        <div class="evo-focus">
          <span>${esc(t('evo2.focus'))}</span>
          <ul>${rec.focus.map((f) => `<li>${esc(t(`focus.${f}`))}</li>`).join('')}</ul>
        </div>
      </div>
      <p class="evo-foot">${esc(t('evo2.foot'))}</p>
    </section>
    <div class="row-btns end">
      <button type="button" class="btn btn-ghost" data-ask="${esc(t('chat.q.why'))}">${esc(t('rec.ask_why'))}</button>
      ${session.status === 'observing' ? `<button type="button" class="btn btn-primary" data-end>${esc(t('rec.end'))} →</button>` : `<button type="button" class="btn btn-primary" data-go="summary">${esc(t('nav.summary'))} →</button>`}
    </div>`;
  const inp = $('#volInput', el);
  inp.addEventListener('change', () => {
    const v = Math.round(Number(inp.value));
    if (!Number.isFinite(v) || v < 10) { inp.value = volume; return; }
    volume = Math.min(v, 100000);
    rec = recommend(detection, session, volume);
    renderRecommendations();
    $('#volInput').focus();
  });
}

/* ─── Intelligence chat ──────────────────────────────────────────── */
const ACTIONS = {
  start: ['chat.act_start', () => (isNarrow() || session.status === 'observing' ? setView(session.status === 'observing' ? 'session' : 'overview', { focus: true }) : startSession())],
  session: ['chat.act_session', () => setView('session')],
  workflows: ['moment.review', () => setView('workflows', { focus: true })],
  recommendations: ['chat.act_rec', () => setView('recommendations', { focus: true })],
  explore: ['chat.act_explore', () => setView('overview', { focus: true })],
};

function renderIntelligence() {
  const el = $('#view-intelligence');
  const draft = $('#chatInput') ? $('#chatInput').value : '';
  const providerBadge = gateway.connected
    ? `<span class="badge" data-status="connected">${esc(t('chat.gw_connected'))}</span>`
    : `<span class="badge" data-status="demo">${esc(t('chat.gw_demo'))}</span>`;
  el.innerHTML = `
    ${heading('VERÍDICO INTELLIGENCE', t('chat.title'), `<p class="lead">${esc(t('chat.lead'))}</p>`)}
    ${entrySource && entryQuestion ? `<p class="entry-note">${esc(t('chat.from_source'))}</p>` : ''}
    <div class="chat-wrap">
      <section class="chat card" aria-label="${esc(t('chat.title'))}">
        <div class="chat-head"><span class="live-dot" aria-hidden="true"></span><b>Verídico Intelligence</b>${providerBadge}</div>
        <div class="chat-log" id="chatLog" aria-live="polite"></div>
        <div class="chat-sugg" id="chatSugg">
          ${SUGGESTED_QUESTIONS.map((k) => `<button type="button" class="chip" data-ask="${esc(t(k))}">${esc(t(k))}</button>`).join('')}
        </div>
        <form class="chat-form" id="chatForm">
          <label class="sr-only" for="chatInput">${esc(t('chat.input_label'))}</label>
          <input id="chatInput" type="text" autocomplete="off" maxlength="500" placeholder="${esc(t('chat.placeholder'))}" />
          <button type="submit" class="btn btn-dark btn-sm">${esc(t('chat.send'))}</button>
        </form>
      </section>
      <aside class="card ctx" id="chatCtx"></aside>
    </div>`;
  $('#chatInput').value = draft;
  $('#chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#chatInput').value.trim();
    if (v) ask(v);
  });
  renderChatLog();
  renderContextPanel();
}

function renderChatLog() {
  const log = $('#chatLog');
  if (!log) return;
  if (!chatLog.length) {
    log.innerHTML = `<div class="msg ai"><span class="who">VERÍDICO INTELLIGENCE</span><div class="txt"><p>${esc(t('chat.welcome'))}</p></div></div>`;
    return;
  }
  log.innerHTML = chatLog.map((m) => {
    if (m.role === 'user') return `<div class="msg user">${esc(m.text)}</div>`;
    if (m.pending) return `<div class="msg ai pending"><span class="who">VERÍDICO INTELLIGENCE</span><div class="txt"><p>${esc(t('chat.thinking'))}</p></div></div>`;
    const acts = (m.actions || []).filter((a) => ACTIONS[a]);
    return `<div class="msg ai"><span class="who">VERÍDICO INTELLIGENCE</span>
      <div class="txt">${m.text.split('\n').filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
      ${acts.length ? `<div class="acts">${acts.map((a) => `<button type="button" class="btn btn-ghost btn-sm" data-act="${a}">${esc(t(ACTIONS[a][0]))} →</button>`).join('')}</div>` : ''}
      <div class="prov">${esc(m.provider === 'deterministic-demo' ? t('chat.prov_demo') : t('chat.prov_gw', { p: m.provider }))}</div></div>`;
  }).join('');
  log.scrollTop = log.scrollHeight;
}

function renderContextPanel() {
  const el = $('#chatCtx');
  if (!el) return;
  const row = (k, v) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  el.innerHTML = `
    <span class="card-k">${esc(t('ctx.title'))}</span>
    <div class="ctx-rows">
      ${row(t('ctx.session'), t(`ctx.st_${session.status}`))}
      ${row(t('obs.events'), String(session.events.length))}
      ${row(t('obs.executions'), String(session.completed().length))}
      ${row(t('ctx.workflow'), detection ? t(`workflow.${detection.workflowKey}`) : '—')}
      ${row(t('metric.similarity'), detection ? pct(detection.similarity) : '—')}
      ${row(t('ctx.recommendation'), rec ? t(`potential.${rec.potential}`) : '—')}
      ${row(t('evo2.recoverable'), rec ? `${hours(rec.estimate.recoverableHoursPerMonth)} · ${t('status.estimate')}` : '—')}
    </div>
    <p class="ctx-note">${esc(gateway.connected ? t('ctx.note_gw') : t('ctx.note_demo'))}</p>`;
}

// Next steps offered under SON Intelligence answers, derived from the demo state.
function stateActions() {
  if (session.status === 'idle') return ['start'];
  if (!detection) return session.status === 'observing' ? ['session'] : ['start'];
  return ['recommendations'];
}

async function ask(question) {
  if (chatBusy) return;
  chatBusy = true;
  chatLog.push({ role: 'user', text: question });
  const pending = { role: 'ai', pending: true };
  chatLog.push(pending);
  const input = $('#chatInput');
  if (input) input.value = '';
  renderChatLog();
  const context = buildIntelligenceContext({ session, detection, recommendation: rec, config: cfg, lang: getLang() });
  const res = await intelligence.ask({ question, lang: getLang(), session_id: session.id || pageSessionId, context });
  const actions = res.provider === 'deterministic-demo' ? (res.actions || []) : stateActions();
  Object.assign(pending, { pending: false, text: res.answer, provider: res.provider, actions });
  if (entryQuestion && chatLog.length === 2 && !pending.actions.includes('explore')) pending.actions.push('explore');
  chatBusy = false;
  gateway.connected = intelligence.gatewayAvailable === true;
  renderChatLog();
  renderContextPanel();
  $('#chatInput')?.focus();
}

/* ─── Sources ────────────────────────────────────────────────────── */
function renderSources() {
  const el = $('#view-sources');
  const rows = [
    ['ORDR', t('src2.ordr'), 'demo'],
    [t('src2.ordr_prod_n'), t('src2.ordr_prod'), 'planned'],
    ['SON Files', t('src2.files'), 'demo'],
    ['SON Browser', t('src2.browser'), 'demo'],
    [t('src2.events_n'), t('src2.events'), 'real'],
    [t('src2.gateway_n'), t('src2.gateway'), gateway.connected ? 'connected' : 'not_connected'],
    [t('src2.email_n'), t('src2.email'), 'planned'],
    [t('src2.erp_n'), t('src2.erp'), 'planned'],
    [t('src2.os_n'), t('src2.os'), 'planned'],
  ];
  el.innerHTML = `
    ${heading(t('src2.kicker'), t('src2.title'), `<p class="lead">${esc(t('src2.lead'))}</p>`)}
    <div class="card">
      <table class="tbl">
        <thead><tr><th>${esc(t('src2.col_source'))}</th><th>${esc(t('src2.col_what'))}</th><th>${esc(t('src2.col_status'))}</th></tr></thead>
        <tbody>${rows.map(([n, w, s]) => `<tr><td><b>${esc(n)}</b></td><td class="muted">${esc(w)}</td><td><span class="badge" data-status="${s}">${esc(t(`status.${s}`))}</span></td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="legend card">
      ${['real', 'demo', 'connected', 'not_connected', 'planned', 'experimental'].map((s) => `<div><span class="badge" data-status="${s}">${esc(t(`status.${s}`))}</span><span>${esc(t(`status_d.${s}`))}</span></div>`).join('')}
    </div>`;
}

/* ─── Summary + Analyze my company ───────────────────────────────── */
function renderSummary() {
  const el = $('#view-summary');
  snapshotLead();
  const s = summarize(session, detection, rec);
  const m = (label, value, kind, note) => `
    <div class="metric"><span class="ml">${esc(label)}</span><b>${esc(value)}</b>
      <small>${kind === 'estimate' ? `<span class="badge" data-status="estimate">${esc(t('status.estimate'))}</span> ` : ''}${esc(note)}</small></div>`;
  const intro = session.status === 'idle' ? t('sum.idle') : session.status === 'observing' ? t('sum.live') : t('sum.ended', { dur: fmtDuration(s.durationMs) });
  el.innerHTML = `
    ${heading(t('sum.kicker'), t('sum.title'), `<p class="lead">${esc(intro)}</p>${session.status === 'observing' ? `<div class="row-btns"><button type="button" class="btn btn-ghost btn-sm" data-end>${esc(t('xp.end_session'))}</button></div>` : ''}`)}
    <div class="metrics">
      ${m(t('sum.events'), fmtNumber(s.events), 'measured', t('sum.measured'))}
      ${m(t('sum.executions'), fmtNumber(s.executions), 'measured', t('sum.measured'))}
      ${m(t('sum.recurring'), fmtNumber(s.recurring), 'measured', t('sum.measured'))}
      ${m(t('sum.repetitive'), fmtNumber(s.repetitiveActions), 'measured', t('sum.repetitive_n'))}
      ${m(t('metric.automation_potential'), s.potential ? t(`potential.${s.potential}`) : '—', 'derived', t('sum.derived'))}
      ${m(t('sum.recoverable'), s.recoverableHours != null ? hours(s.recoverableHours) : '—', 'estimate', t('sum.assume', { v: fmtNumber(volume) }))}
    </div>

    <section class="final">
      <h2>${esc(t('final.big'))}</h2>
      <p>${esc(t('final.big_sub'))}</p>
      <button type="button" class="btn btn-primary btn-lg mono-caps" id="analyzeBtn">${esc(t('final.cta_caps'))}</button>
    </section>

    <section class="card lead-card" id="leadCard" aria-labelledby="leadT">
      <span class="card-k" id="leadT">${esc(t('lead.title'))}</span>
      <p class="muted">${esc(t('lead.sub'))}</p>
      ${leadState === 'sent' ? `<div class="notice ok" role="status">${esc(t('lead.sent'))}</div>` : `
      <form id="leadForm" class="lead-form" novalidate>
        <div class="f"><label for="lf_name">${esc(t('lead.name'))} *</label><input id="lf_name" name="name" required autocomplete="name" /></div>
        <div class="f"><label for="lf_company">${esc(t('lead.company'))} *</label><input id="lf_company" name="company" required autocomplete="organization" /></div>
        <div class="f"><label for="lf_role">${esc(t('lead.role'))}</label><input id="lf_role" name="role" autocomplete="organization-title" /></div>
        <div class="f"><label for="lf_email">${esc(t('lead.email'))} *</label><input id="lf_email" name="email" type="email" required autocomplete="email" /></div>
        <div class="f"><label for="lf_size">${esc(t('lead.size'))}</label>
          <select id="lf_size" name="size"><option value="">${esc(t('ordr.select'))}</option>${['1-10', '11-50', '51-200', '201-1000', '1000+'].map((x) => `<option value="${x}">${x}</option>`).join('')}</select></div>
        <div class="f"><label for="lf_software">${esc(t('lead.software'))}</label><input id="lf_software" name="software" /></div>
        <div class="f full"><label for="lf_process">${esc(t('lead.process'))}</label><textarea id="lf_process" name="process" rows="3" maxlength="2000"></textarea></div>
        <label class="check full"><input type="checkbox" id="lf_unknown" name="unknown" /> <span>${esc(t('lead.unknown'))}</span></label>
        <label class="check full"><input type="checkbox" id="lf_consent" name="consent" required /> <span>${esc(t('lead.consent'))} <a href="index.html#privacidad" target="_blank" rel="noopener">${esc(t('lead.privacy'))}</a></span></label>
        <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true" />
        <div class="full lead-actions">
          <button type="submit" class="btn btn-primary" ${leadState === 'sending' ? 'disabled' : ''}>${esc(leadState === 'sending' ? t('lead.sending') : t('lead.submit'))}</button>
          <span class="err" id="leadErr" role="alert">${leadState === 'error' ? esc(t('lead.error')) : ''}</span>
        </div>
      </form>`}
    </section>`;
  restoreLead();
  $('#analyzeBtn', el).addEventListener('click', () => {
    $('#leadCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => $('#lf_name')?.focus(), 350);
  });
  const form = $('#leadForm', el);
  if (form) {
    form.addEventListener('input', snapshotLead);
    $('#lf_unknown', form).addEventListener('change', syncUnknown);
    syncUnknown();
    form.addEventListener('submit', submitLead);
  }
}
function syncUnknown() {
  const u = $('#lf_unknown'); const p = $('#lf_process');
  if (u && p) { p.disabled = u.checked; }
}
function snapshotLead() {
  const f = $('#leadForm');
  if (!f) return;
  [...f.elements].forEach((x) => { if (x.name) leadDraft[x.name] = x.type === 'checkbox' ? x.checked : x.value; });
}
function restoreLead() {
  const f = $('#leadForm');
  if (!f) return;
  [...f.elements].forEach((x) => {
    if (!x.name || !(x.name in leadDraft)) return;
    if (x.type === 'checkbox') x.checked = !!leadDraft[x.name]; else x.value = leadDraft[x.name];
  });
}
async function submitLead(e) {
  e.preventDefault();
  const f = e.target;
  snapshotLead();
  const err = $('#leadErr');
  const bad = ['name', 'company', 'email'].find((k) => !String(leadDraft[k] || '').trim());
  if (bad) { err.textContent = t('lead.required'); f.elements[bad].focus(); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadDraft.email)) { err.textContent = t('lead.bad_email'); f.elements.email.focus(); return; }
  if (!leadDraft.consent) { err.textContent = t('lead.need_consent'); f.elements.consent.focus(); return; }
  leadState = 'sending';
  renderSummary();
  const s = summarize(session, detection, rec);
  const unknown = !!leadDraft.unknown;
  try {
    if (!cfg.LEADS_ENDPOINT) throw new Error('no backend configured');
    const r = await fetch(cfg.LEADS_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        name: leadDraft.name || '',
        company: leadDraft.company || '',
        role: leadDraft.role || '',
        email: leadDraft.email || '',
        size: leadDraft.size || '',
        software: leadDraft.software || '',
        repetitive_process: unknown ? '' : leadDraft.process || '',
        let_veridico_discover: unknown,
        consent: !!leadDraft.consent,
        website: leadDraft.website || '',
        lang: getLang(),
        source: entrySource || 'veridico-demo',
        demo: { events: s.events, executions: s.executions, recurring: s.recurring, workflow: detection ? detection.workflowKey : null },
      }),
    });
    const j = await r.json().catch(() => null);
    leadState = r.ok && j && j.accepted ? 'sent' : 'error'; // accepted:false + fallback → email alternative
  } catch (x) {
    leadState = 'error';
  }
  renderSummary();
}

/* ─── Global delegation ──────────────────────────────────────────── */
document.addEventListener('click', (e) => {
  const nav = e.target.closest('#xpNav [data-view]');
  if (nav) { setView(nav.dataset.view, { focus: true }); return; }
  const go = e.target.closest('[data-go]');
  if (go) { setView(go.dataset.go, { focus: true }); return; }
  if (e.target.closest('[data-start]')) { startSession(); return; }
  if (e.target.closest('[data-end]')) { endSession(); return; }
  const a = e.target.closest('[data-ask]');
  if (a) { setView('intelligence'); ask(a.dataset.ask); return; }
  const act = e.target.closest('.chat-log [data-act]');
  if (act && ACTIONS[act.dataset.act]) ACTIONS[act.dataset.act][1]();
});
$('#xpEnd').addEventListener('click', endSession);

document.addEventListener('langchange', () => {
  if (desktop) desktop.relabel();
  ordr.render(); files.render(); browser.render();
  renderAll();
  if (!$('#moment').hidden) showMoment();
});
narrowMq.addEventListener('change', () => { renderView('overview'); renderView('session'); });

/* ─── Boot ───────────────────────────────────────────────────────── */
applyI18n();
mountLangSwitcher($('#langSwitch'));
const startView = ['overview', 'intelligence', 'sources'].includes(params.get('view')) ? params.get('view') : 'overview';
renderAll();
setView(startView);

(async function boot() {
  const status = intelligence.status().then((s) => { gateway.connected = s.connected; renderSources(); renderContextPanel(); if (view === 'intelligence') renderIntelligence(); });
  if (params.get('entry') === 'portal') {
    await portalArrive({ label: t('portal.arriving') });
  }
  // Keep only presentation params in the URL.
  const keep = new URLSearchParams();
  ['lang', 'threshold'].forEach((k) => { if (params.get(k)) keep.set(k, params.get(k)); });
  history.replaceState(null, '', location.pathname + (keep.toString() ? `?${keep}` : ''));

  if (startView === 'intelligence' && entryQuestion) {
    await status;
    const input = $('#chatInput');
    input.value = entryQuestion;
    input.focus();
    ask(entryQuestion);
  }
}());
