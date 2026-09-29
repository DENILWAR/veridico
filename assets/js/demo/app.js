// Verídico Intelligence — interactive demo orchestrator.
// Flow: Overview → Start Observation Session → desktop (ORDR / SON Files / SON Browser)
//       → events → executions → deterministic detection → The Moment → Workflows
//       → Recommendations (+ role evolution) → Intelligence (Metrics | Chat) → Summary → Analyze my company.
//
// Principle: deterministic demo state = truth (events, executions, detection, metrics).
// Verídico Intelligence (LLM via backend → SON Intelligence) = reasoning layer over that state.
import { applyI18n, mountLangSwitcher, t, fmtNumber, fmtDuration, getLang } from '../i18n.js';
import { portalArrive } from '../portal.js';
import { DEMO_CONFIG as cfg } from './config.js';
import { ObservationSession, newId } from './session.js';
import { detect } from './detector.js';
import { recommend, summarize } from './recommend.js';
import { Desktop } from './desktop.js';
import { INVOICES, COMPANY } from './data.js';
import { ICONS } from './icons.js';
import { createOrdr } from './apps/ordr.js';
import { createFiles } from './apps/files.js';
import { createBrowser } from './apps/browser.js';
import { VeridicoIntelligenceClient, DemoIntelligenceProvider, buildIntelligenceContext, SUGGESTED_QUESTIONS } from '../intelligence/gateway.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const pct = (x) => `${fmtNumber(x * 100)}%`;
const hours = (h) => `${fmtNumber(h, 1)} h/${t('unit.month')}`;
const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─── State ──────────────────────────────────────────────────────── */
const session = new ObservationSession();
let detection = null;
let rec = null;
let volume = cfg.ESTIMATE_MONTHLY_VOLUME;
let momentShown = false;
let observerOpen = false;
let view = 'overview';
let intTab = 'chat';                       // Verídico Intelligence tab: 'metrics' | 'chat'
let guideOn = false;                       // optional, dismissible guided mode
let ffRunning = false;                     // DEMO FAST-FORWARD in progress
let ffInfo = null;                         // banner state
const unseen = { workflows: false, recommendations: false, intelligence: false };
const chatLog = [];
let chatBusy = false;
let gateway = { connected: false };
const leadDraft = {};
let leadState = 'idle'; // idle | sending | sent | error

const params = new URLSearchParams(location.search);
const entryQuestion = (params.get('q') || '').trim().slice(0, 500);
const entrySource = params.get('source');
const DEBUG = params.get('debug') === '1';   // shows provider / request_id / state; never on by default
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
  onRender: () => scheduleGuide(),
});
const files = createFiles({ record, openInBrowser: (id) => { desktop.open('browser'); browser.load(id); } });
const browser = createBrowser({ record, onVerified: (id) => ordr.markVerified(id), returnToOrdr: () => desktop.open('ordr') });

function ensureDesktop() {
  if (desktop) return;
  desktop = new Desktop($('#desktop'), $('#dock'));
  desktop.onChange = () => scheduleGuide();
  desktop.register({
    id: 'ordr', title: 'ORDR', badgeKey: 'ordr.demo_crm', badgeStatus: 'demo', icon: ICONS.ordr,
    geometry: (r) => ({ x: 16, y: 14, w: Math.min(1040, r.width - 32), h: Math.max(420, r.height - 110) }),
    mount: (b) => ordr.mount(b),
  });
  desktop.register({
    id: 'files', title: 'SON Files', icon: ICONS.files,
    geometry: (r) => ({ x: Math.max(24, r.width - 470), y: 40, w: 450, h: 340 }),
    mount: (b) => files.mount(b),
  });
  desktop.register({
    id: 'browser', title: 'SON Browser', icon: ICONS.browser,
    geometry: (r) => ({ x: Math.max(24, r.width - 700), y: 110, w: 640, h: 400 }),
    mount: (b) => browser.mount(b),
  });
  desktop.register({
    id: 'activity', titleKey: 'dock.activity', icon: ICONS.activity, separatorBefore: true,
    dockAction: () => { observerOpen = !observerOpen; renderObserver(); },
  });
  desktop.register({
    id: 'intelligence', titleKey: 'dock.intelligence', icon: ICONS.intelligence,
    dockAction: () => openIntelligence(detection && unseen.intelligence ? 'metrics' : 'chat'),
  });
  desktop.register({
    id: 'summary', titleKey: 'nav.summary', icon: ICONS.summary,
    dockAction: () => setView('summary', { focus: true }),
  });
  desktop.enableAutoHide($('#deskWrap'));
  syncDockFlags();
}
function syncDockFlags() {
  if (!desktop) return;
  desktop.setFlag('intelligence', 'has-new', unseen.intelligence);
  desktop.setFlag('activity', 'active', observerOpen);
}

/* ─── Session lifecycle ──────────────────────────────────────────── */
function startSession({ goTo = 'session' } = {}) {
  session.start();
  detection = null; rec = null; momentShown = false;
  unseen.workflows = unseen.recommendations = unseen.intelligence = false;
  observerOpen = false;
  ordr.reset();
  setView(goTo);
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

session.addEventListener('event', () => { renderStatus(); scheduleObserver(); scheduleGuide(); scheduleIntelligenceRefresh(); });
session.addEventListener('status', () => { renderStatus(); renderNav(); });
session.addEventListener('execution', () => {
  const d = detect(session.completed(), cfg);
  if (d) {
    const first = !detection;
    detection = d;
    rec = recommend(detection, session, volume);
    if (first) { unseen.workflows = unseen.recommendations = unseen.intelligence = true; }
    if (!momentShown) {
      momentShown = true;
      setTimeout(showMoment, cfg.MOMENT_DELAY_MS); // let the save confirmation land first
    }
  }
  renderNav();
  if (view === 'intelligence') refreshIntelligence();
  else if (view !== 'session') renderView(view);
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
    const lbl = b.querySelector('.lbl');
    if (lbl) b.setAttribute('aria-label', lbl.textContent + (unseen[v] ? ` · ${t('xp.new')}` : ''));
  });
  $('#navFoot').innerHTML = `<span>${esc(t('xp.threshold_label'))}</span><b>${cfg.DEMO_THRESHOLD}</b><small>${esc(t('xp.threshold_note'))}</small>`;
  // Focus mode: quieter, collapsed navigation while working on the desktop, workflow or Intelligence.
  document.body.classList.toggle('focus-mode', !isNarrow() && ['session', 'intelligence', 'workflows'].includes(view));
  syncDockFlags();
}

let observerQueued = false;
function scheduleObserver() {
  if (observerQueued) return;
  observerQueued = true;
  requestAnimationFrame(() => { observerQueued = false; renderObserver(); });
}
function renderObserver() {
  const el = $('#observer');
  syncDockFlags();
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
        ${last.length ? last.map((e) => `<li><span class="mono t">${esc(time(e.ts))}</span><span class="mono ty">${esc(e.type.replace(/^(crm|files|browser)\./, ''))}${e.demo_generated ? ` <abbr class="ff-tag" title="${esc(t('ff.badge'))}">FF</abbr>` : ''}</span><span class="mono id">${esc(e.entity ? e.entity.id.replace('INV-2026-', '#') : '')}</span></li>`).join('') : `<li class="muted">${esc(t('obs.none'))}</li>`}
      </ol>
      <p class="obs-foot">${esc(t('obs.foot'))}</p>
    </div>`;
  el.querySelector('.obs-pill').addEventListener('click', () => { observerOpen = !observerOpen; renderObserver(); });
  const pill = el.querySelector('.obs-pill');
  pill.classList.remove('tick'); void pill.offsetWidth; pill.classList.add('tick');
}

/* ─── The Moment ─────────────────────────────────────────────────── */
const ffExecutions = () => session.completed().filter((e) => e.demoGenerated).length;

function showMoment() {
  if (!detection || view !== 'session' || isNarrow()) {
    // Not on the desktop right now: the nav marks Intelligence / Workflows as new instead.
    renderNav();
    return;
  }
  const el = $('#moment');
  el.hidden = false;
  const ff = detection.executionIds.filter((id) => (session.executions.find((x) => x.id === id) || {}).demoGenerated).length;
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
      ${ff ? `<p class="m-basis"><span class="badge" data-status="demo">${esc(t('ff.badge'))}</span> ${esc(t('moment.ff_note', { n: ff }))}</p>` : ''}
      <div class="m-act">
        <button type="button" class="btn btn-primary" data-m="ask">${esc(t('moment.ask'))} →</button>
        <button type="button" class="btn btn-ghost" data-m="review">${esc(t('moment.review'))}</button>
        <button type="button" class="btn btn-ghost" data-m="keep">${esc(t('moment.keep'))}</button>
      </div>
    </div>`;
  el.querySelector('[data-m="ask"]').addEventListener('click', () => { hideMoment(); openIntelligence('chat', { focusInput: true }); });
  el.querySelector('[data-m="review"]').addEventListener('click', () => { hideMoment(); setView('workflows'); });
  el.querySelector('[data-m="keep"]').addEventListener('click', hideMoment);
  el.querySelector('[data-m="ask"]').focus();
}
function hideMoment() { const el = $('#moment'); el.hidden = true; el.innerHTML = ''; }
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#xpDialog').hidden) { closeDialog(); return; }
  if (!$('#moment').hidden) hideMoment();
});

/* ─── Views ─────────────────────────────────────────────────────── */
function setView(v, { focus = false } = {}) {
  view = v;
  if (unseen[v]) unseen[v] = false;
  if (v === 'intelligence' && intTab === 'metrics') unseen.intelligence = false;
  document.querySelectorAll('.view').forEach((s) => { s.hidden = s.dataset.view !== v; });
  renderNav();
  renderView(v);
  if (v === 'session') { ensureDesktopIfObserving(); }
  if (focus) { const h = $(`#view-${v} h1`); if (h) h.focus(); }
  $('#xpMain').scrollTop = 0;
  scheduleGuide();
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
      ${detection ? `<button type="button" class="btn btn-ghost" data-intel="chat">${esc(t('moment.ask'))}</button>` : ''}</div>`;
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
        <div class="row-btns"><button type="button" class="btn btn-primary" data-intel="chat">${esc(t('mobile.ask'))}</button><button type="button" class="btn btn-ghost" data-qa="fastforward">${esc(t('ff.cta'))}</button></div></div>`
      : `<div class="row-btns">
          <button type="button" class="btn btn-primary btn-lg" data-start>${esc(t('ov.start'))}</button>
          <button type="button" class="btn btn-ghost" data-qa="guide">${esc(t('qa.guide'))}</button>
          <button type="button" class="btn btn-ghost" data-qa="fastforward">${esc(t('ff.cta'))}</button>
        </div>`}
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
      <div class="row-btns"><button type="button" class="btn btn-primary" data-intel="chat">${esc(t('mobile.ask'))}</button><button type="button" class="btn btn-ghost" data-qa="fastforward">${esc(t('ff.cta'))}</button></div>
    </div>` : '';
  if (narrow) return;
  if (session.status === 'idle') {
    gate.hidden = false;
    gate.innerHTML = `<div class="gate-card"><span class="kicker">${esc(t('ov.kicker'))}</span><h1 tabindex="-1">${esc(t('gate.title'))}</h1><p>${esc(t('gate.text'))}</p>
      <div class="row-btns"><button type="button" class="btn btn-primary" data-start>${esc(t('ov.start'))}</button><button type="button" class="btn btn-ghost" data-qa="guide">${esc(t('qa.guide'))}</button><button type="button" class="btn btn-ghost" data-qa="fastforward">${esc(t('ff.cta'))}</button></div></div>`;
  } else if (session.status === 'ended') {
    gate.hidden = false;
    gate.innerHTML = `<div class="gate-card"><h1 tabindex="-1">${esc(t('ov.ended_title'))}</h1><div class="row-btns"><button type="button" class="btn btn-primary" data-go="summary">${esc(t('nav.summary'))} →</button><button type="button" class="btn btn-ghost" data-start>${esc(t('ov.restart'))}</button></div></div>`;
  } else {
    gate.hidden = true;
    gate.innerHTML = '';
  }
  renderDeskTools();
  renderFF();
  scheduleGuide();
}

function renderDeskTools() {
  const el = $('#deskTools');
  if (session.status !== 'observing') { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button type="button" class="tool ${guideOn ? 'on' : ''}" data-qa="guide-toggle" aria-pressed="${guideOn}">${ICONS.guide}<span>${esc(t('qa.guide'))}</span></button>
    ${detection ? '' : `<button type="button" class="tool" data-qa="fastforward" ${ffRunning ? 'disabled' : ''}>${ICONS.forward}<span>${esc(t('ff.cta'))}</span></button>`}`;
}

/* ─── Existing evidence fragments (reused by Workflows, Recommendations, Summary and the Metrics tab) ── */
function waitingInner() {
  const done = session.completed().length;
  return `
      <p>${esc(session.status === 'idle' ? t('wf.empty_idle') : t('wf.empty_obs', { n: cfg.DEMO_THRESHOLD }))}</p>
      <div class="progress" role="img" aria-label="${esc(t('wf.progress', { done: Math.min(done, cfg.DEMO_THRESHOLD), n: cfg.DEMO_THRESHOLD }))}">
        ${Array.from({ length: cfg.DEMO_THRESHOLD }, (_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('')}
      </div>
      <small>${esc(t('wf.progress', { done: Math.min(done, cfg.DEMO_THRESHOLD), n: cfg.DEMO_THRESHOLD }))}</small>`;
}
function waiting(kicker, title) {
  return `
    ${heading(kicker, title)}
    <div class="empty card">
      ${waitingInner()}
      <div class="row-btns">${session.status === 'idle' ? `<button type="button" class="btn btn-primary" data-go="overview">${esc(t('ov.start'))}</button>` : `<button type="button" class="btn btn-primary" data-go="session">${esc(t('ov.return'))}</button>`}</div>
    </div>`;
}
const workflowMetaHTML = (d) => `
        <span>${esc(t('wf.observed_n', { n: d.size }))}</span><span>·</span>
        <span>${esc(t('metric.avg_duration'))} ${esc(fmtDuration(d.avgDurationMs))}</span><span>·</span>
        <span>${esc(t('metric.avg_actions'))} ${fmtNumber(d.avgActions)}</span><span>·</span>
        <span>${esc(t('metric.similarity'))} ${esc(pct(d.similarity))}</span>`;
const seqHTML = (d) => `
        <ol class="seq">
          ${d.steps.map((s, i) => `
            <li><span class="n">${String(i + 1).padStart(2, '0')}</span>
              <div><b>${esc(t(`step.${s.code}`))}</b><small>${esc(t('wf.step_seen', { k: s.count, n: s.total }))} · ${esc(t('wf.step_at', { t: fmtDuration(s.avgAtMs) }))}</small></div></li>`).join('')}
        </ol>`;
const variantsHTML = (d) => (d.variants.length
  ? `<ul class="variants">${d.variants.map((v) => `<li><b>${esc(t(`step.${v.code}`))}</b><span>${esc(t(v.kind === 'extra' ? 'wf.var_extra' : 'wf.var_skipped', { k: v.count, n: v.total }))}</span></li>`).join('')}</ul>`
  : `<p class="muted">${esc(t('wf.no_variants'))}</p>`);
const isFF = (id) => !!(session.executions.find((x) => x.id === id) || {}).demoGenerated;
const executionsHTML = (d) => `
          <table class="tbl small"><thead><tr><th>#</th><th>${esc(t('ordr.col_invoice'))}</th><th class="r">${esc(t('wf.actions'))}</th><th class="r">${esc(t('wf.duration'))}</th></tr></thead>
          <tbody>${d.executions.map((e) => `<tr><td>${e.id}${isFF(e.id) ? ` <abbr class="ff-tag" title="${esc(t('ff.badge'))}">FF</abbr>` : ''}</td><td class="mono">${esc(e.invoiceId)}</td><td class="r">${e.actions}</td><td class="r">${esc(fmtDuration(e.durationMs))}</td></tr>`).join('')}</tbody></table>`;
const recListsHTML = () => {
  const stepNames = (codes) => codes.map((c) => t(`step.${c}`)).join(', ');
  return `
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
      </section>`;
};
function summaryTilesHTML(s) {
  const m = (label, value, kind, note) => `
    <div class="metric"><span class="ml">${esc(label)}</span><b>${esc(value)}</b>
      <small>${kind === 'estimate' ? `<span class="badge" data-status="estimate">${esc(t('status.estimate'))}</span> ` : ''}${esc(note)}</small></div>`;
  return `
    <div class="metrics">
      ${m(t('sum.events'), fmtNumber(s.events), 'measured', t('sum.measured'))}
      ${m(t('sum.executions'), fmtNumber(s.executions), 'measured', t('sum.measured'))}
      ${m(t('sum.recurring'), fmtNumber(s.recurring), 'measured', t('sum.measured'))}
      ${m(t('sum.repetitive'), fmtNumber(s.repetitiveActions), 'measured', t('sum.repetitive_n'))}
      ${m(t('metric.automation_potential'), s.potential ? t(`potential.${s.potential}`) : '—', 'derived', t('sum.derived'))}
      ${m(t('sum.recoverable'), s.recoverableHours != null ? hours(s.recoverableHours) : '—', 'estimate', t('sum.assume', { v: fmtNumber(volume) }))}
    </div>
    ${ffExecutions() ? `<p class="ff-note"><span class="badge" data-status="demo">${esc(t('ff.badge'))}</span> ${esc(t('sum.ff_note', { n: ffExecutions() }))}</p>` : ''}`;
}

function renderWorkflows() {
  const el = $('#view-workflows');
  if (!detection) { el.innerHTML = waiting(t('wf.kicker'), t('wf.title_empty')); return; }
  const d = detection;
  el.innerHTML = `
    ${heading(t('wf.kicker'), t(`workflow.${d.workflowKey}`), `
      <div class="meta-row">
        <span class="badge" data-status="real">${esc(t('wf.from_session'))}</span>
        ${workflowMetaHTML(d)}
      </div>`)}
    <div class="wf-grid">
      <section class="card" aria-labelledby="wfSeqT">
        <span class="card-k" id="wfSeqT">${esc(t('wf.observed_workflow'))}</span>
        ${seqHTML(d)}
      </section>
      <div class="stack">
        <section class="card">
          <span class="card-k">${esc(t('wf.variants'))}</span>
          ${variantsHTML(d)}
        </section>
        <section class="card">
          <span class="card-k">${esc(t('wf.executions'))}</span>
          ${executionsHTML(d)}
        </section>
        <section class="card method">
          <span class="card-k">${esc(t('wf.method_t'))}</span>
          <p>${esc(t('wf.method', { n: cfg.DEMO_THRESHOLD, sim: Math.round(cfg.SIMILARITY_MIN * 100) }))}</p>
        </section>
      </div>
    </div>
    <div class="row-btns end">
      <button type="button" class="btn btn-ghost" data-ask="${esc(t('chat.q.explain_detect'))}">${esc(t('ask.why_detected'))}</button>
      <button type="button" class="btn btn-primary" data-go="recommendations">${esc(t('wf.to_rec'))} →</button>
    </div>`;
}

function renderRecommendations() {
  const el = $('#view-recommendations');
  if (!detection || !rec) { el.innerHTML = waiting(t('rec.kicker'), t('rec.title_empty')); return; }
  const e = rec.estimate;
  el.innerHTML = `
    ${heading(t('rec.kicker'), t('rec.title', { workflow: t(`workflow.${detection.workflowKey}`) }), `<div class="meta-row"><span class="badge" data-status="estimate">${esc(t('rec.badge'))}</span><span>${esc(t('rec.potential'))}: <b>${esc(t(`potential.${rec.potential}`))}</b></span></div>`)}
    <div class="rec-grid">
      ${recListsHTML()}
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

/* ─── Verídico Intelligence: [ Metrics ] [ Chat ] ────────────────── */
const ACTIONS = {
  start: ['chat.act_start', () => exploreOnMyOwn()],
  session: ['chat.act_session', () => setView('session')],
  workflows: ['moment.review', () => setView('workflows', { focus: true })],
  recommendations: ['chat.act_rec', () => setView('recommendations', { focus: true })],
  metrics: ['chat.act_metrics', () => openIntelligence('metrics')],
  explore: ['chat.act_explore', () => setView('overview', { focus: true })],
  guide: ['qa.guide', () => startGuide()],
  fastforward: ['ff.cta', () => openFFDialog()],
};

// Deterministic next steps offered under answers (the LLM explains; the state decides).
function stateActions() {
  if (session.status === 'idle') return ['guide', 'start', 'fastforward'];
  if (!detection) return session.status === 'observing' ? (ffRunning ? ['session'] : ['session', 'fastforward']) : ['start'];
  return ['metrics', 'recommendations'];
}

function contextState() {
  if (detection) return 'workflow_detected';
  if (session.status === 'idle') return 'no_session';
  return session.status === 'ended' ? 'session_ended' : 'observing';
}

/** Deterministic, state-aware guidance line (spec: frontend state decides the important actions). */
function guidanceLine() {
  const done = session.completed().length;
  const n = cfg.DEMO_THRESHOLD;
  if (session.status === 'idle') return { key: 'gd.idle', vars: {}, actions: ['start', 'guide', 'fastforward'] };
  if (detection) return { key: 'gd.detected', vars: {}, asks: ['chat.q.why'] };
  if (session.status === 'ended') return { key: 'gd.ended', vars: {}, actions: ['start'] };
  if (ffRunning) return { key: 'gd.ff', vars: {}, actions: ['session'] };
  if (done === 0) return { key: 'gd.first', vars: {}, actions: ['session', 'guide'] };
  if (done === n - 1) return { key: 'gd.almost', vars: { n: done }, actions: ['session', 'fastforward'] };
  if (done === 1) return { key: 'gd.one', vars: {}, actions: ['session', 'fastforward'] };
  return { key: 'gd.some', vars: { n: done, left: Math.max(1, n - done) }, actions: ['session', 'fastforward'] };
}

function openIntelligence(tab = 'chat', { focusInput = false } = {}) {
  intTab = tab;
  setView('intelligence');
  if (tab === 'chat' && focusInput && !isNarrow()) $('#chatInput')?.focus();
}

function renderIntelligence() {
  const el = $('#view-intelligence');
  const draft = $('#chatInput') ? $('#chatInput').value : '';
  const tab = (id, icon, label, extra = '') => `
      <button type="button" role="tab" id="tab-${id}" class="int-tab" aria-controls="panel-${id}" aria-selected="${intTab === id}" tabindex="${intTab === id ? 0 : -1}" data-tab="${id}">
        ${ICONS[icon]}<span>${esc(label)}</span>${extra}</button>`;
  el.innerHTML = `
    <header class="vh int-head">
      <div class="int-top">
        <span class="kicker">VERÍDICO INTELLIGENCE</span>
        <span class="env-wrap" id="envWrap">
          <button type="button" class="env-pill" id="envBtn" aria-expanded="false" aria-describedby="envTip">${ICONS.info}<span>${esc(t('env.pill'))}</span></button>
          <span class="env-tip" id="envTip" role="tooltip"><b>${esc(t('env.pill'))}</b>${esc(t('env.tip'))}<br><br>${esc(t('env.partner'))}</span>
        </span>
      </div>
      <h1 tabindex="-1">${esc(t('int.title'))}</h1>
      <p class="lead">${esc(t('int.lead'))}</p>
      ${entrySource && entryQuestion ? `<p class="entry-note">${esc(t('chat.from_source'))}</p>` : ''}
      <div class="int-tabs" role="tablist" aria-label="${esc(t('int.tabs_label'))}">
        ${tab('metrics', 'metrics', t('int.metrics'), detection && unseen.intelligence ? `<i class="tab-dot" aria-label="${esc(t('xp.new'))}"></i>` : '')}
        ${tab('chat', 'chat', t('int.chat'))}
      </div>
    </header>
    <section class="int-panel" role="tabpanel" id="panel-metrics" aria-labelledby="tab-metrics" ${intTab === 'metrics' ? '' : 'hidden'}></section>
    <section class="int-panel" role="tabpanel" id="panel-chat" aria-labelledby="tab-chat" ${intTab === 'chat' ? '' : 'hidden'}>
      <div class="chat-wrap">
        <section class="chat card" aria-label="${esc(t('int.chat'))}">
          <div class="chat-head"><span class="live-dot" aria-hidden="true"></span><b>Verídico Intelligence</b>${DEBUG ? `<span class="badge" data-status="${gateway.connected ? 'connected' : 'not_connected'}">debug · gateway ${gateway.connected ? 'ready' : 'off'}</span>` : ''}</div>
          <div class="guide-line" id="guideLine" role="status"></div>
          <div class="chat-log" id="chatLog" role="log" aria-live="polite" aria-label="${esc(t('int.chat'))}"></div>
          <div class="chat-sugg" id="chatSugg" aria-label="${esc(t('chat.suggestions'))}"></div>
          <form class="chat-form" id="chatForm">
            <label class="sr-only" for="chatInput">${esc(t('chat.input_label'))}</label>
            <textarea id="chatInput" rows="1" maxlength="2000" autocomplete="off" placeholder="${esc(t('chat.placeholder'))}" aria-describedby="chatHint"></textarea>
            <button type="submit" class="btn btn-dark send" id="chatSend">${ICONS.send}<span>${esc(t('chat.send'))}</span></button>
          </form>
          <p class="chat-hint" id="chatHint">${esc(t('chat.hint'))}</p>
        </section>
        <aside class="card ctx" id="chatCtx"></aside>
      </div>
    </section>`;
  const input = $('#chatInput');
  input.value = draft;
  autosize(input);
  input.addEventListener('input', () => autosize(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submitComposer(); }
  });
  $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); submitComposer(); });
  // Tabs: click + arrow keys (roving tabindex).
  el.querySelectorAll('.int-tab').forEach((b) => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
    b.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const next = intTab === 'metrics' ? 'chat' : 'metrics';
      switchTab(e.key === 'Home' ? 'metrics' : e.key === 'End' ? 'chat' : next, { focusTab: true });
    });
  });
  const envWrap = $('#envWrap');
  $('#envBtn').addEventListener('click', () => {
    const open = !envWrap.classList.contains('open');
    envWrap.classList.toggle('open', open);
    $('#envBtn').setAttribute('aria-expanded', String(open));
  });
  renderChatLog();
  refreshIntelligence();
  setComposerBusy(chatBusy);
}

function switchTab(tab, { focusTab = false } = {}) {
  intTab = tab;
  if (tab === 'metrics') unseen.intelligence = false;
  renderIntelligence();
  renderNav();
  if (focusTab) $(`#tab-${tab}`)?.focus();
}

let intelQueued = false;
function scheduleIntelligenceRefresh() {
  if (view !== 'intelligence' || intelQueued) return;
  intelQueued = true;
  requestAnimationFrame(() => { intelQueued = false; refreshIntelligence(); });
}
/** Live parts of Intelligence (never touches the composer draft). */
function refreshIntelligence() {
  if (!$('#panel-chat')) return;
  renderGuideLine();
  renderSuggestions();
  renderContextPanel();
  if (intTab === 'metrics') renderMetricsPanel();
}

function renderGuideLine() {
  const el = $('#guideLine');
  if (!el) return;
  const g = guidanceLine();
  const btns = [
    ...(g.actions || []).filter((a) => ACTIONS[a]).map((a) => `<button type="button" class="linkish" data-act="${a}">${esc(t(ACTIONS[a][0]))}</button>`),
    ...(g.asks || []).map((k) => `<button type="button" class="linkish" data-ask="${esc(t(k))}">${esc(t(k))}</button>`),
  ];
  el.innerHTML = `${ICONS.guide}<span>${esc(t(g.key, g.vars))}</span>${btns.length ? `<span class="gl-acts">${btns.join('')}</span>` : ''}`;
}

function renderSuggestions() {
  const el = $('#chatSugg');
  if (!el) return;
  const keys = SUGGESTED_QUESTIONS[contextState()] || [];
  el.innerHTML = keys.map((k) => `<button type="button" class="chip" data-ask="${esc(t(k))}" ${chatBusy ? 'disabled' : ''}>${esc(t(k))}</button>`).join('');
}

/** Safe light formatting for model answers: text is escaped first; only bold, code, headings and lists are recognised. */
function richText(text) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
  let html = '';
  let list = null;
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  String(text).split('\n').forEach((raw) => {
    const l = raw.trim();
    let m;
    if (!l) { close(); return; }
    if ((m = l.match(/^#{1,6}\s+(.*)$/))) { close(); html += `<p class="h">${inline(m[1])}</p>`; }
    else if ((m = l.match(/^[-*•]\s+(.*)$/))) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
    else { close(); html += `<p>${inline(l)}</p>`; }
  });
  close();
  return html;
}

function renderChatLog() {
  const log = $('#chatLog');
  if (!log) return;
  if (!chatLog.length) {
    log.innerHTML = `
      <div class="msg ai welcome"><span class="who">VERÍDICO INTELLIGENCE</span>
        <div class="txt"><p><b>${esc(t('chat.welcome_t'))}</b></p><p>${esc(t('chat.welcome2'))}</p></div>
        <div class="acts">
          <button type="button" class="btn btn-primary btn-sm" data-qa="guide">${esc(t('qa.guide'))}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-qa="explore">${esc(t('qa.explore'))}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-qa="fastforward">${esc(t('ff.cta'))}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-qa="ask">${esc(t('qa.ask'))}</button>
        </div>
      </div>`;
    return;
  }
  log.innerHTML = chatLog.map((m) => {
    if (m.role === 'user') return `<div class="msg user">${esc(m.text).replace(/\n/g, '<br>')}</div>`;
    if (m.pending) return `<div class="msg ai pending" aria-busy="true"><span class="who">VERÍDICO INTELLIGENCE</span><div class="txt"><p><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span> ${esc(t('chat.thinking'))}</p></div></div>`;
    const acts = (m.actions || []).filter((a) => ACTIONS[a]);
    return `<div class="msg ai"><span class="who">VERÍDICO INTELLIGENCE</span>
      <div class="txt">${richText(m.text)}</div>
      ${acts.length ? `<div class="acts">${acts.map((a) => `<button type="button" class="btn btn-ghost btn-sm" data-act="${a}">${esc(t(ACTIONS[a][0]))} →</button>`).join('')}</div>` : ''}
      ${DEBUG ? `<div class="prov">debug · provider: ${esc(m.provider)} · request_id: ${esc(m.requestId || '—')} · state: ${esc(m.state)}</div>` : ''}</div>`;
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
    <p class="ctx-note">${esc(t('ctx.note'))}</p>
    ${DEBUG ? `<p class="ctx-note">debug · state: ${esc(contextState())} · gateway: ${gateway.connected ? 'ready' : 'off'} · endpoint: ${esc(cfg.INTELLIGENCE_ENDPOINT || '—')}</p>` : ''}`;
}

/** Metrics tab: the existing evidence, reframed (no new metrics, same computations). */
function renderMetricsPanel() {
  const el = $('#panel-metrics');
  if (!el) return;
  const s = summarize(session, detection, rec);
  const askBtn = (qKey, labelKey) => `<button type="button" class="ask-this" data-ask="${esc(t(qKey))}">${ICONS.chat}<span>${esc(t(labelKey))}</span></button>`;
  const d = detection;
  el.innerHTML = `
    <section class="im-block">
      <div class="im-head"><span class="card-k">${esc(t('im.session'))}</span><span class="badge" data-status="real">${esc(t('im.observed_badge'))}</span></div>
      ${summaryTilesHTML(s)}
    </section>
    <section class="im-block">
      <div class="im-head"><span class="card-k">${esc(t('im.workflow'))}</span>${d ? askBtn('chat.q.explain_detect', 'ask.why_detected') + askBtn('chat.q.similarity', 'ask.similarity') : ''}</div>
      ${d ? `
        <div class="card">
          <div class="im-wf-name">${esc(t(`workflow.${d.workflowKey}`))}</div>
          <div class="meta-row">${workflowMetaHTML(d)}</div>
          <div class="wf-grid im-wf">
            <div>${seqHTML(d)}</div>
            <div class="stack">
              <div><span class="card-k">${esc(t('wf.variants'))}</span>${variantsHTML(d)}</div>
              <div><span class="card-k">${esc(t('wf.executions'))}</span>${executionsHTML(d)}</div>
            </div>
          </div>
        </div>` : `<div class="empty card">${waitingInner()}</div>`}
    </section>
    <section class="im-block">
      <div class="im-head"><span class="card-k">${esc(t('im.recommendation'))}</span>${rec ? `<span class="badge" data-status="estimate">${esc(t('rec.badge'))}</span>` + askBtn('chat.q.human', 'ask.human') + askBtn('chat.q.impact', 'ask.impact') : ''}</div>
      ${rec ? `
        <div class="rec-grid">${recListsHTML()}</div>
        <div class="card im-est">
          <div><span>${esc(t('evo2.manual'))}</span><b>${esc(hours(rec.estimate.manualHoursPerMonth))}</b></div>
          <div class="hi"><span>${esc(t('evo2.recoverable'))}</span><b>${esc(hours(rec.estimate.recoverableHoursPerMonth))}</b></div>
          <p><span class="badge" data-status="estimate">${esc(t('status.estimate'))}</span> ${esc(t('sum.assume', { v: fmtNumber(volume) }))} · <button type="button" class="linkish" data-go="recommendations">${esc(t('im.change_assumption'))}</button></p>
        </div>` : `<div class="empty card"><p>${esc(t('rec.title_empty'))}</p></div>`}
    </section>`;
}

function autosize(el) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}
function setComposerBusy(busy) {
  const send = $('#chatSend');
  const log = $('#chatLog');
  if (send) { send.disabled = busy; send.setAttribute('aria-disabled', String(busy)); }
  if (log) log.setAttribute('aria-busy', String(busy));
  document.querySelectorAll('#chatSugg .chip').forEach((c) => { c.disabled = busy; });
}
function submitComposer() {
  const input = $('#chatInput');
  const v = input ? input.value.trim() : '';
  if (!v || chatBusy) return;
  askVeridico(v, { fromComposer: true });
}

/**
 * The single Intelligence flow. Used by the Chat composer, quick prompts, ?q= entry, The Moment,
 * "Ask about this" in Metrics and every guidance action. One client, one context builder.
 */
async function askVeridico(question, { fromComposer = false } = {}) {
  const q = String(question || '').trim().slice(0, 2000);
  if (!q || chatBusy) return;
  if (view !== 'intelligence' || intTab !== 'chat') { intTab = 'chat'; setView('intelligence'); }
  chatBusy = true;
  chatLog.push({ role: 'user', text: q });
  const pending = { role: 'ai', pending: true };
  chatLog.push(pending);
  const input = $('#chatInput');
  if (input && fromComposer) { input.value = ''; autosize(input); }
  renderChatLog();
  setComposerBusy(true);
  renderSuggestions();
  const context = buildIntelligenceContext({ session, detection, recommendation: rec, config: cfg, lang: getLang() });
  const res = await intelligence.ask({ question: q, lang: getLang(), session_id: session.id || pageSessionId, context });
  const actions = res.provider === 'deterministic-demo' ? [...(res.actions || [])] : stateActions();
  if (entryQuestion && chatLog.length === 2 && !actions.includes('explore')) actions.push('explore');
  Object.assign(pending, { pending: false, text: res.answer, provider: res.provider, requestId: res.requestId, state: context.state, actions });
  chatBusy = false;
  gateway.connected = intelligence.gatewayAvailable === true;
  renderChatLog();
  setComposerBusy(false);
  refreshIntelligence();
  if (fromComposer || !isNarrow()) $('#chatInput')?.focus();
}

/* ─── Guided mode (optional, dismissible, never blocking) ────────── */
function startGuide() {
  guideOn = true;
  if (session.status !== 'observing') startSession();
  else setView('session');
  renderDeskTools();
  scheduleGuide();
}
function exploreOnMyOwn() {
  guideOn = false;
  if (session.status !== 'observing') startSession(); else setView('session');
  renderDeskTools();
  scheduleGuide();
}

function currentGuide() {
  if (session.status !== 'observing' || detection || !desktop) return null;
  const W = '.win[data-app="ordr"]';
  const st = ordr.state;
  const ordrApp = desktop.apps.get('ordr');
  const inv = st.view === 'invoice' ? st.invoices.find((x) => x.id === st.openId) : null;
  if (!ordrApp || !ordrApp.open) return { step: 0, hint: 'guide.h_open_ordr', target: '.dock-ordr' };
  if (!inv) {
    const next = ordr.nextPendingId();
    return { step: 0, hint: 'guide.h_open', target: st.view === 'queue' ? `${W} [data-act="open"][data-id="${next}"]` : `${W} [data-act="nav"][data-to="queue"]` };
  }
  if (inv.saved) return { step: 6, hint: 'guide.h_back', target: `${W} .notice [data-act="back"]` };
  if (!inv.assignedClientId) {
    const hasResults = st.results && st.results.length;
    return { step: 1, hint: hasResults ? 'guide.h_pick' : 'guide.h_client', target: hasResults ? `${W} .results [data-id="${inv.clientId}"]` : '#ordrSearch' };
  }
  if (!inv.type) return { step: 2, hint: 'guide.h_type', target: '#ordrType' };
  if (inv.status === 'pending_review') return { step: 3, hint: 'guide.h_status', target: '#ordrStatus' };
  if (!inv.taskId) return { step: 4, hint: 'guide.h_task', target: `${W} [data-act="task"]` };
  return { step: 5, hint: 'guide.h_save', target: `${W} [data-act="save"]` };
}

let guideQueued = false;
function scheduleGuide() {
  if (guideQueued) return;
  guideQueued = true;
  requestAnimationFrame(() => { guideQueued = false; renderGuide(); });
}
function renderGuide() {
  document.querySelectorAll('.guide-target').forEach((n) => n.classList.remove('guide-target'));
  const panel = $('#guidePanel');
  const g = guideOn && view === 'session' && !isNarrow() && !ffRunning ? currentGuide() : null;
  if (!g) { panel.hidden = true; panel.innerHTML = ''; return; }
  const done = session.completed().length;
  const labels = ['guide.s1', 'guide.s2', 'guide.s3', 'guide.s4', 'guide.s5', 'guide.s6'];
  panel.hidden = false;
  panel.innerHTML = `
    <div class="gp-head"><span class="gp-k">${ICONS.guide}${esc(t('guide.title'))}</span>
      <span class="gp-count">${esc(t('guide.count', { k: Math.min(done + 1, cfg.DEMO_THRESHOLD), n: cfg.DEMO_THRESHOLD }))}</span>
      <button type="button" class="gp-close" data-qa="guide-off" aria-label="${esc(t('guide.close'))}">${ICONS.close}</button></div>
    <ol class="gp-steps">${labels.map((k, i) => `<li class="${i < g.step ? 'done' : i === g.step ? 'cur' : ''}" ${i === g.step ? 'aria-current="step"' : ''}>${esc(t(k))}</li>`).join('')}</ol>
    <p class="gp-hint">${esc(t(g.hint))}</p>
    <p class="gp-foot">${esc(t('guide.foot'))}</p>`;
  const target = g.target && document.querySelector(g.target);
  if (target) target.classList.add('guide-target');
}

/* ─── DEMO FAST-FORWARD ──────────────────────────────────────────── */
let dialogReturnFocus = null;
function openFFDialog() {
  if (ffRunning || detection) { if (detection) openIntelligence('metrics'); return; }
  dialogReturnFocus = document.activeElement;
  const el = $('#xpDialog');
  el.hidden = false;
  el.innerHTML = `
    <div class="dlg-backdrop" data-qa="dialog-close"></div>
    <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="ffT" aria-describedby="ffD">
      <span class="badge" data-status="demo">${esc(t('ff.badge'))}</span>
      <h2 id="ffT">${esc(t('ff.title'))}</h2>
      <p id="ffD">${esc(t('ff.text'))}</p>
      <p class="muted small">${esc(t('ff.detail'))}</p>
      <div class="row-btns">
        <button type="button" class="btn btn-primary" data-qa="ff-run">${ICONS.forward}<span>${esc(t('ff.run'))}</span></button>
        <button type="button" class="btn btn-ghost" data-qa="dialog-close">${esc(t('ff.cancel'))}</button>
      </div>
    </div>`;
  $('[data-qa="ff-run"]', el).focus();
}
function closeDialog() {
  const el = $('#xpDialog');
  el.hidden = true;
  el.innerHTML = '';
  if (dialogReturnFocus && document.contains(dialogReturnFocus)) dialogReturnFocus.focus();
  dialogReturnFocus = null;
}

/** Drives the remaining interactions through ORDR's own action paths → session.record() → real detector. */
async function runFastForward() {
  closeDialog();
  if (ffRunning || detection) return;
  if (session.status !== 'observing') startSession({ goTo: isNarrow() ? 'intelligence' : 'session' });
  else if (!isNarrow()) setView('session');
  ensureDesktop();
  if (!isNarrow()) desktop.open('ordr');
  hideMoment();
  ffRunning = true;
  let simulated = 0;
  renderDeskTools();
  while (!detection && session.status === 'observing') {
    const id = ordr.nextPendingId();
    if (!id) break;
    ffInfo = { running: true, invoice: id, n: simulated + 1 };
    renderFF();
    await ordr.simulate(id, { delay: REDUCE ? 30 : 170, onStep: () => renderFF() });
    simulated++;
  }
  ffRunning = false;
  ffInfo = { running: false, n: simulated, detected: !!detection };
  renderFF();
  renderDeskTools();
  refreshIntelligence();
  setTimeout(() => { if (ffInfo && !ffInfo.running) { ffInfo = null; renderFF(); } }, 7000);
  if (isNarrow() && detection) openIntelligence('metrics');
}
function renderFF() {
  const el = $('#ffBanner');
  if (!ffInfo || session.status === 'idle') { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = `<span class="badge" data-status="demo">${esc(t('ff.badge'))}</span><span>${esc(ffInfo.running
    ? t('ff.running', { invoice: ffInfo.invoice, n: ffInfo.n })
    : t(ffInfo.detected ? 'ff.done' : 'ff.done_none', { n: ffInfo.n }))}</span>`;
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
  const intro = session.status === 'idle' ? t('sum.idle') : session.status === 'observing' ? t('sum.live') : t('sum.ended', { dur: fmtDuration(s.durationMs) });
  el.innerHTML = `
    ${heading(t('sum.kicker'), t('sum.title'), `<p class="lead">${esc(intro)}</p>${session.status === 'observing' ? `<div class="row-btns"><button type="button" class="btn btn-ghost btn-sm" data-end>${esc(t('xp.end_session'))}</button></div>` : ''}`)}
    ${summaryTilesHTML(s)}

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
    $('#leadCard').scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
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
  const intel = e.target.closest('[data-intel]');
  if (intel) { openIntelligence(intel.dataset.intel, { focusInput: true }); return; }
  if (e.target.closest('[data-start]')) { exploreOnMyOwn(); return; }
  if (e.target.closest('[data-end]')) { endSession(); return; }
  const qa = e.target.closest('[data-qa]');
  if (qa) {
    const k = qa.dataset.qa;
    if (k === 'guide') startGuide();
    else if (k === 'guide-toggle') { if (guideOn) { guideOn = false; renderDeskTools(); scheduleGuide(); } else startGuide(); }
    else if (k === 'guide-off') { guideOn = false; renderDeskTools(); scheduleGuide(); }
    else if (k === 'explore') exploreOnMyOwn();
    else if (k === 'fastforward') openFFDialog();
    else if (k === 'ff-run') runFastForward();
    else if (k === 'dialog-close') closeDialog();
    else if (k === 'ask') $('#chatInput')?.focus();
    return;
  }
  const a = e.target.closest('[data-ask]');
  if (a) { askVeridico(a.dataset.ask); return; }
  const act = e.target.closest('#view-intelligence [data-act]');
  if (act && ACTIONS[act.dataset.act]) ACTIONS[act.dataset.act][1]();
});
$('#xpEnd').addEventListener('click', endSession);
$('#navToggle').addEventListener('click', () => {
  const nav = $('#xpNav');
  const pinned = !nav.classList.contains('pinned');
  nav.classList.toggle('pinned', pinned);
  $('#navToggle').setAttribute('aria-expanded', String(pinned));
});

document.addEventListener('langchange', () => {
  if (desktop) desktop.relabel();
  ordr.render(); files.render(); browser.render();
  renderAll();
  renderFF();
  if (!$('#moment').hidden) showMoment();
});
narrowMq.addEventListener('change', () => { renderView('overview'); renderView('session'); renderNav(); scheduleGuide(); });

/* ─── Boot ───────────────────────────────────────────────────────── */
document.querySelectorAll('[data-icon]').forEach((b) => { if (ICONS[b.dataset.icon]) b.insertAdjacentHTML('afterbegin', ICONS[b.dataset.icon]); });
applyI18n();
mountLangSwitcher($('#langSwitch'));
const startView = ['overview', 'intelligence', 'sources'].includes(params.get('view')) ? params.get('view') : 'overview';
renderAll();
setView(startView);

(async function boot() {
  const status = intelligence.status().then((s) => { gateway.connected = s.connected; renderSources(); refreshIntelligence(); });
  if (params.get('entry') === 'portal') {
    await portalArrive({ label: t('portal.arriving') });
  }
  // Keep only presentation params in the URL.
  const keep = new URLSearchParams();
  ['lang', 'threshold', 'debug'].forEach((k) => { if (params.get(k)) keep.set(k, params.get(k)); });
  history.replaceState(null, '', location.pathname + (keep.toString() ? `?${keep}` : ''));

  if (startView === 'intelligence' && entryQuestion) {
    await status;
    askVeridico(entryQuestion);
  }
}());
