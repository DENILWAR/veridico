// ORDR — DEMO CRM ENVIRONMENT.
// A deliberately small CRM: just enough to process pending invoices. Every meaningful user
// action is reported through `record()` as a real event; the detector only sees these events.
import { t, getLang } from '../../i18n.js';
import { COMPANY, CLIENTS, INVOICES, DOC_TYPES, STATUSES, clientById, searchClients } from '../data.js';
import { DEMO_CONFIG } from '../config.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => new Intl.NumberFormat(getLang(), { style: 'currency', currency: 'EUR' }).format(n);
const date = (iso) => new Intl.DateTimeFormat(getLang(), { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));

export function createOrdr({ record, openFileFor, onSaved }) {
  const state = {
    view: 'queue',
    openId: null,
    query: '',
    results: null,
    notice: null,
    tasks: [],
    invoices: INVOICES.map((inv) => ({ ...inv, assignedClientId: null, type: '', status: 'pending_review', taskId: null, saved: false, verified: false })),
  };
  let body = null;
  let readTimer = null;

  const inv = () => state.invoices.find((i) => i.id === state.openId);
  const ent = (i) => ({ type: 'invoice', id: i.id });
  const rec = (type, i, data) => record(type, { app: 'ORDR', entity: i ? ent(i) : null, data });

  function mount(el) {
    body = el;
    body.addEventListener('click', onClick);
    body.addEventListener('change', onChange);
    body.addEventListener('submit', onSubmit);
    render();
  }

  function go(view) { state.view = view; state.openId = null; state.notice = null; render(); }

  function openInvoice(id) {
    clearTimeout(readTimer);
    state.view = 'invoice';
    state.openId = id;
    state.query = '';
    state.results = null;
    state.notice = null;
    const i = inv();
    rec('crm.invoice.open', i, { supplier: i.supplier });
    render();
    let read = false;
    readTimer = setTimeout(() => {
      if (state.openId === id && !read) { read = true; rec('crm.invoice.read', i, { dwellMs: DEMO_CONFIG.READ_DWELL_MS }); render(); }
    }, DEMO_CONFIG.READ_DWELL_MS);
  }

  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const i = inv();
    if (act === 'nav') go(b.dataset.to);
    else if (act === 'open') openInvoice(b.dataset.id);
    else if (act === 'back') {
      clearTimeout(readTimer);
      if (i) rec('crm.queue.return', i, {});
      go('queue');
    } else if (act === 'pick') {
      const c = clientById(b.dataset.id);
      i.assignedClientId = c.id;
      const taxMatch = c.id === i.clientId;
      rec('crm.client.select', i, { clientId: c.id, taxMatch });
      state.results = null;
      render();
    } else if (act === 'unassign') {
      i.assignedClientId = null;
      render();
      body.querySelector('#ordrSearch')?.focus();
    } else if (act === 'task') {
      const c = clientById(i.assignedClientId);
      const title = t('ordr.task_title', { client: c ? c.name : i.supplier });
      if (i.taskId) {
        const task = state.tasks.find((x) => x.id === i.taskId);
        task.title = title;
        rec('crm.task.update', i, { taskId: task.id });
      } else {
        const task = { id: `T-${String(301 + state.tasks.length)}`, invoiceId: i.id, title, due: '2026-10-05' };
        state.tasks.push(task);
        i.taskId = task.id;
        rec('crm.task.create', i, { taskId: task.id });
      }
      render();
    } else if (act === 'file') {
      openFileFor(i.id);
    } else if (act === 'save') {
      save(i);
    }
  }

  function onChange(e) {
    const i = inv();
    if (!i) return;
    if (e.target.id === 'ordrType') {
      i.type = e.target.value;
      rec('crm.invoice.classify', i, { type: i.type });
      render();
      body.querySelector('#ordrType')?.focus();
    } else if (e.target.id === 'ordrStatus') {
      const from = i.status;
      i.status = e.target.value;
      rec('crm.invoice.status_change', i, { from, to: i.status });
      render();
      body.querySelector('#ordrStatus')?.focus();
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    const i = inv();
    if (e.target.id === 'ordrSearchForm' && i) {
      state.query = body.querySelector('#ordrSearch').value.trim();
      state.results = searchClients(state.query);
      rec('crm.client.search', i, { query: state.query, results: state.results.length });
      render();
      body.querySelector('.results button')?.focus();
    }
  }

  function missing(i) {
    const m = [];
    if (!i.assignedClientId) m.push(t('ordr.f_client'));
    if (!i.type) m.push(t('ordr.f_type'));
    if (i.status === 'pending_review') m.push(t('ordr.f_status'));
    if (!i.taskId) m.push(t('ordr.f_task'));
    return m;
  }

  function save(i) {
    const m = missing(i);
    if (m.length) { state.notice = { kind: 'warn', text: t('ordr.save_missing', { fields: m.join(', ') }) }; render(); return; }
    i.saved = true;
    rec('crm.invoice.save', i, { status: i.status, type: i.type, clientId: i.assignedClientId });
    state.notice = { kind: 'ok', text: t('ordr.saved', { id: i.id }) };
    render();
    body.querySelector('[data-act="back"]')?.focus();
    onSaved && onSaved(i);
  }

  function nextHint(i) {
    if (!i.assignedClientId) return t('ordr.hint_client');
    if (!i.type) return t('ordr.hint_type');
    if (i.status === 'pending_review') return t('ordr.hint_status');
    if (!i.taskId) return t('ordr.hint_task');
    if (!i.saved) return t('ordr.hint_save');
    return t('ordr.hint_back');
  }

  /* ─── Rendering ─────────────────────────────────────────────── */
  function render() {
    if (!body) return;
    const pending = state.invoices.filter((i) => !i.saved).length;
    const nav = [['dashboard', 'ordr.nav_dashboard'], ['clients', 'ordr.nav_clients'], ['documents', 'ordr.nav_documents'], ['invoices', 'ordr.nav_invoices'], ['tasks', 'ordr.nav_tasks'], ['queue', 'ordr.nav_queue']];
    const active = state.view === 'invoice' ? 'queue' : state.view;
    body.innerHTML = `
      <div class="ordr">
        <aside class="ordr-side">
          <div class="ordr-logo">ORDR</div>
          <span class="badge" data-status="demo">${esc(t('ordr.demo_crm'))}</span>
          <nav class="ordr-nav" aria-label="ORDR">
            ${nav.map(([v, k]) => `<button type="button" data-act="nav" data-to="${v}" ${active === v ? 'aria-current="page"' : ''}>${esc(t(k))}${v === 'queue' && pending ? `<span class="cnt">${pending}</span>` : ''}</button>`).join('')}
          </nav>
          <div class="ordr-org">${esc(COMPANY.name)}<small>${esc(t('xp.demo_company'))}</small></div>
        </aside>
        <div class="ordr-main">
          <div class="ordr-env">ORDR — ${esc(t('ordr.env'))}</div>
          <div class="ordr-content">${views[state.view]()}</div>
        </div>
      </div>`;
  }

  const statusPill = (s) => `<span class="pill st-${s}">${esc(t(`ordr.status.${s}`))}</span>`;

  const views = {
    queue() {
      const rows = state.invoices;
      const pending = rows.filter((i) => !i.saved).length;
      return `
        <div class="ordr-h"><h3>${esc(t('ordr.queue_title'))}</h3><span class="muted">${esc(t('ordr.queue_sub', { n: pending }))}</span></div>
        <table class="tbl">
          <thead><tr><th>${esc(t('ordr.col_invoice'))}</th><th>${esc(t('ordr.col_supplier'))}</th><th>${esc(t('ordr.col_received'))}</th><th class="r">${esc(t('ordr.col_amount'))}</th><th>${esc(t('ordr.col_status'))}</th><th></th></tr></thead>
          <tbody>${rows.map((i) => `
            <tr class="${i.saved ? 'done' : ''}">
              <td class="mono">${esc(i.id)}</td><td>${esc(i.supplier)}</td><td>${esc(date(i.date))}</td>
              <td class="r">${esc(money(i.amount))}</td><td>${statusPill(i.saved ? i.status : 'pending_review')}</td>
              <td class="r">${i.saved ? `<span class="muted">${esc(t('ordr.processed'))}</span>` : `<button type="button" class="btn btn-ghost btn-sm" data-act="open" data-id="${i.id}">${esc(t('ordr.open'))}</button>`}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;
    },

    invoice() {
      const i = inv();
      const c = i.assignedClientId ? clientById(i.assignedClientId) : null;
      const billTo = clientById(i.clientId);
      const task = i.taskId ? state.tasks.find((x) => x.id === i.taskId) : null;
      const mismatch = c && c.id !== i.clientId;
      const done = (ok) => `<span class="chk ${ok ? 'ok' : ''}" aria-hidden="true"></span>`;
      return `
        <div class="inv-head">
          <button type="button" class="btn btn-ghost btn-sm" data-act="back">← ${esc(t('ordr.back_queue'))}</button>
          <div><span class="mono">${esc(i.id)}</span> · ${esc(i.supplier)}</div>
          ${statusPill(i.status)}
        </div>
        ${state.notice ? `<div class="notice ${state.notice.kind}" role="status">${esc(state.notice.text)}${state.notice.kind === 'ok' ? ` <button type="button" class="linkish" data-act="back">${esc(t('ordr.back_queue'))} →</button>` : ''}</div>` : `<div class="hint" role="status"><b>${esc(t('ordr.next'))}</b> ${esc(nextHint(i))}</div>`}
        <div class="inv-grid">
          <article class="paper" aria-label="${esc(t('ordr.document'))}">
            <div class="paper-top"><b>${esc(i.supplier)}</b><span>${esc(t('ordr.p_invoice'))} ${esc(i.id)}</span></div>
            <div class="paper-row"><span>${esc(t('ordr.p_bill_to'))}</span><b>${esc(billTo.name)}</b></div>
            <div class="paper-row"><span>${esc(t('ordr.p_tax_id'))}</span><b class="mono">${esc(billTo.taxId)}</b></div>
            <div class="paper-row"><span>${esc(t('ordr.p_date'))}</span><b>${esc(date(i.date))}</b></div>
            <div class="paper-lines">
              ${i.lines.map(([d, v]) => `<div><span>${esc(d)}</span><span>${esc(money(v))}</span></div>`).join('')}
            </div>
            <div class="paper-total"><span>${esc(t('ordr.p_total'))}</span><b>${esc(money(i.amount))}</b></div>
            <div class="paper-foot">${esc(i.file)} · ${esc(t('ordr.p_demo'))}</div>
          </article>

          <div class="inv-form">
            <div class="fld">
              <div class="fld-l">${done(!!c)}<span>1 · ${esc(t('ordr.f_client'))}</span></div>
              ${c ? `
                <div class="assigned ${mismatch ? 'warn' : ''}">
                  <div><b>${esc(c.name)}</b><small class="mono">${esc(c.id)} · ${esc(c.taxId)}</small></div>
                  <button type="button" class="linkish" data-act="unassign">${esc(t('ordr.change'))}</button>
                </div>
                ${mismatch ? `<p class="fld-warn">${esc(t('ordr.tax_mismatch'))}</p>` : ''}` : `
                <form id="ordrSearchForm" class="search" role="search">
                  <label class="sr-only" for="ordrSearch">${esc(t('ordr.search_label'))}</label>
                  <input id="ordrSearch" type="search" autocomplete="off" value="${esc(state.query)}" placeholder="${esc(t('ordr.search_ph'))}" />
                  <button type="submit" class="btn btn-dark btn-sm">${esc(t('ordr.search'))}</button>
                </form>
                ${state.results ? (state.results.length ? `<div class="results">${state.results.map((r) => `
                  <button type="button" data-act="pick" data-id="${r.id}"><b>${esc(r.name)}</b><small class="mono">${esc(r.id)} · ${esc(r.taxId)} · ${esc(r.city)}</small></button>`).join('')}</div>`
                  : `<p class="muted small">${esc(t('ordr.no_results'))}</p>`) : ''}`}
            </div>

            <div class="fld">
              <label class="fld-l" for="ordrType">${done(!!i.type)}<span>2 · ${esc(t('ordr.f_type'))}</span></label>
              <select id="ordrType">
                <option value="" ${!i.type ? 'selected' : ''} disabled>${esc(t('ordr.select'))}</option>
                ${DOC_TYPES.map((d) => `<option value="${d}" ${i.type === d ? 'selected' : ''}>${esc(t(`ordr.type.${d}`))}</option>`).join('')}
              </select>
            </div>

            <div class="fld">
              <label class="fld-l" for="ordrStatus">${done(i.status !== 'pending_review')}<span>3 · ${esc(t('ordr.f_status'))}</span></label>
              <select id="ordrStatus">
                ${STATUSES.map((s) => `<option value="${s}" ${i.status === s ? 'selected' : ''}>${esc(t(`ordr.status.${s}`))}</option>`).join('')}
              </select>
            </div>

            <div class="fld">
              <div class="fld-l">${done(!!task)}<span>4 · ${esc(t('ordr.f_task'))}</span></div>
              ${task ? `<div class="assigned"><div><b>${esc(task.title)}</b><small class="mono">${esc(task.id)} · ${esc(t('ordr.due'))} ${esc(date(task.due))}</small></div><button type="button" class="linkish" data-act="task">${esc(t('ordr.update'))}</button></div>`
                : `<button type="button" class="btn btn-ghost btn-sm" data-act="task" ${c ? '' : 'disabled'}>${esc(t('ordr.create_task'))}</button>`}
            </div>

            <div class="fld opt">
              <div class="fld-l">${done(i.verified)}<span>${esc(t('ordr.f_verify'))} <em>${esc(t('ordr.optional'))}</em></span></div>
              ${i.verified ? `<p class="small ok-text">${esc(t('ordr.verified'))}</p>` : `<button type="button" class="linkish" data-act="file">${esc(t('ordr.open_file'))} →</button>`}
            </div>

            <button type="button" class="btn btn-primary save" data-act="save" ${i.saved ? 'disabled' : ''}>${esc(i.saved ? t('ordr.saved_short') : t('ordr.save'))}</button>
          </div>
        </div>`;
    },

    dashboard() {
      const pending = state.invoices.filter((i) => !i.saved).length;
      const cards = [[t('ordr.d_pending'), pending], [t('ordr.d_processed'), state.invoices.length - pending], [t('ordr.d_tasks'), state.tasks.length], [t('ordr.d_clients'), CLIENTS.length]];
      return `
        <div class="ordr-h"><h3>${esc(t('ordr.nav_dashboard'))}</h3><span class="muted">${esc(COMPANY.name)}</span></div>
        <div class="dash-cards">${cards.map(([l, v]) => `<div class="dcard"><span>${esc(l)}</span><b>${v}</b></div>`).join('')}</div>
        <p class="muted small" style="margin-top:14px">${esc(t('ordr.d_note'))}</p>
        <button type="button" class="btn btn-dark btn-sm" style="margin-top:14px" data-act="nav" data-to="queue">${esc(t('ordr.go_queue'))}</button>`;
    },

    clients() {
      return `
        <div class="ordr-h"><h3>${esc(t('ordr.nav_clients'))}</h3><span class="muted">${CLIENTS.length}</span></div>
        <table class="tbl"><thead><tr><th>ID</th><th>${esc(t('ordr.col_name'))}</th><th>${esc(t('ordr.p_tax_id'))}</th><th>${esc(t('ordr.col_city'))}</th></tr></thead>
        <tbody>${CLIENTS.map((c) => `<tr><td class="mono">${c.id}</td><td>${esc(c.name)}</td><td class="mono">${c.taxId}</td><td>${esc(c.city)}</td></tr>`).join('')}</tbody></table>`;
    },

    documents() {
      return `
        <div class="ordr-h"><h3>${esc(t('ordr.nav_documents'))}</h3></div>
        <table class="tbl"><thead><tr><th>${esc(t('ordr.col_file'))}</th><th>${esc(t('ordr.col_invoice'))}</th><th>${esc(t('ordr.f_type'))}</th></tr></thead>
        <tbody>${state.invoices.map((i) => `<tr><td class="mono">${esc(i.file)}</td><td class="mono">${esc(i.id)}</td><td>${i.type ? esc(t(`ordr.type.${i.type}`)) : `<span class="muted">${esc(t('ordr.unclassified'))}</span>`}</td></tr>`).join('')}</tbody></table>`;
    },

    invoices() {
      return `
        <div class="ordr-h"><h3>${esc(t('ordr.nav_invoices'))}</h3></div>
        <table class="tbl"><thead><tr><th>${esc(t('ordr.col_invoice'))}</th><th>${esc(t('ordr.f_client'))}</th><th class="r">${esc(t('ordr.col_amount'))}</th><th>${esc(t('ordr.col_status'))}</th></tr></thead>
        <tbody>${state.invoices.map((i) => `<tr><td class="mono">${esc(i.id)}</td><td>${i.assignedClientId ? esc(clientById(i.assignedClientId).name) : '<span class="muted">—</span>'}</td><td class="r">${esc(money(i.amount))}</td><td>${statusPill(i.saved ? i.status : 'pending_review')}</td></tr>`).join('')}</tbody></table>`;
    },

    tasks() {
      return `
        <div class="ordr-h"><h3>${esc(t('ordr.nav_tasks'))}</h3><span class="muted">${state.tasks.length}</span></div>
        ${state.tasks.length ? `<table class="tbl"><thead><tr><th>ID</th><th>${esc(t('ordr.col_task'))}</th><th>${esc(t('ordr.col_invoice'))}</th><th>${esc(t('ordr.due'))}</th></tr></thead>
        <tbody>${state.tasks.map((k) => `<tr><td class="mono">${k.id}</td><td>${esc(k.title)}</td><td class="mono">${k.invoiceId}</td><td>${esc(date(k.due))}</td></tr>`).join('')}</tbody></table>`
          : `<p class="muted">${esc(t('ordr.no_tasks'))}</p>`}`;
    },
  };

  return {
    mount,
    render,
    state,
    markVerified(invoiceId) {
      const i = state.invoices.find((x) => x.id === invoiceId);
      if (i) { i.verified = true; render(); }
    },
    reset() {
      clearTimeout(readTimer);
      state.view = 'queue'; state.openId = null; state.tasks = []; state.notice = null;
      state.invoices = INVOICES.map((x) => ({ ...x, assignedClientId: null, type: '', status: 'pending_review', taskId: null, saved: false, verified: false }));
      render();
    },
  };
}
