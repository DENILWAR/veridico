// SON Browser — hosts fictitious internal tools only (no real internet).
// Tool: SON DocCheck, an internal document verification page.
import { t, getLang } from '../../i18n.js';
import { INVOICES, clientById } from '../data.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createBrowser({ record, onVerified, returnToOrdr }) {
  const state = { invoiceId: null, phase: 'idle' }; // idle | loaded | checking | done
  let body = null;

  function mount(el) {
    body = el;
    body.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'verify' && state.phase === 'loaded') {
        state.phase = 'checking';
        render();
        setTimeout(() => {
          state.phase = 'done';
          record('browser.document.process', { app: 'SON Browser', entity: { type: 'invoice', id: state.invoiceId }, data: { tool: 'son-doccheck', result: 'verified' } });
          onVerified(state.invoiceId);
          render();
          body.querySelector('[data-act="return"]')?.focus();
        }, 700);
      } else if (act.dataset.act === 'return') {
        returnToOrdr();
      }
    });
    render();
  }

  function load(invoiceId) {
    state.invoiceId = invoiceId;
    state.phase = 'loaded';
    record('browser.tool.open', { app: 'SON Browser', entity: { type: 'invoice', id: invoiceId }, data: { tool: 'son-doccheck' } });
    render();
  }

  function render() {
    if (!body) return;
    const i = INVOICES.find((x) => x.id === state.invoiceId);
    const money = (n) => new Intl.NumberFormat(getLang(), { style: 'currency', currency: 'EUR' }).format(n);
    const url = `son://tools/doccheck${i ? `?file=${i.file}` : ''}`;
    body.innerHTML = `
      <div class="browser">
        <div class="br-tabs"><span class="br-tab">SON DocCheck</span></div>
        <div class="br-bar"><span class="br-lock" aria-hidden="true">●</span><span class="mono">${esc(url)}</span></div>
        <div class="br-page">
          <div class="dc-head"><b>SON DocCheck</b><span class="muted small">${esc(t('br.tool_sub'))}</span><span class="badge" data-status="demo">${esc(t('br.demo_tool'))}</span></div>
          ${!i ? `<p class="muted" style="margin-top:18px">${esc(t('br.empty'))}</p>` : `
            <div class="dc-doc">
              <span class="fic" aria-hidden="true">PDF</span>
              <div><b class="mono">${esc(i.file)}</b><small>${esc(i.supplier)} · ${esc(money(i.amount))}</small></div>
              ${state.phase === 'loaded' ? `<button type="button" class="btn btn-dark btn-sm" data-act="verify">${esc(t('br.verify'))}</button>` : ''}
              ${state.phase === 'checking' ? `<span class="muted small">${esc(t('br.checking'))}</span>` : ''}
            </div>
            ${state.phase === 'done' ? `
              <ul class="dc-res">
                <li>${esc(t('br.r_supplier', { s: i.supplier }))}</li>
                <li>${esc(t('br.r_total', { v: money(i.amount) }))}</li>
                <li>${esc(t('br.r_tax', { id: clientById(i.clientId).taxId }))}</li>
                <li>${esc(t('br.r_dup'))}</li>
              </ul>
              <button type="button" class="btn btn-primary btn-sm" data-act="return">${esc(t('br.return'))}</button>` : ''}`}
        </div>
      </div>`;
  }

  return { mount, render, load };
}
