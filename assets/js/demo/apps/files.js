// SON Files — neutral file browser holding the invoice PDFs of the demo company.
import { t, getLang } from '../../i18n.js';
import { INVOICES } from '../data.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createFiles({ record, openInBrowser }) {
  const state = { selected: null };
  let body = null;

  function mount(el) {
    body = el;
    body.addEventListener('click', (e) => {
      const row = e.target.closest('[data-file]');
      const act = e.target.closest('[data-act]');
      if (act && act.dataset.act === 'browser' && state.selected) {
        record('files.document.open', { app: 'SON Files', entity: { type: 'invoice', id: state.selected }, data: { file: `${state.selected}.pdf` } });
        openInBrowser(state.selected);
        return;
      }
      if (row) { state.selected = row.dataset.file; render(); }
    });
    body.addEventListener('dblclick', (e) => {
      const row = e.target.closest('[data-file]');
      if (!row) return;
      state.selected = row.dataset.file;
      record('files.document.open', { app: 'SON Files', entity: { type: 'invoice', id: state.selected }, data: { file: `${state.selected}.pdf` } });
      openInBrowser(state.selected);
    });
    render();
  }

  function render() {
    if (!body) return;
    const d = (iso) => new Intl.DateTimeFormat(getLang(), { day: '2-digit', month: 'short' }).format(new Date(iso));
    body.innerHTML = `
      <div class="files">
        <aside class="files-side">
          <div class="files-sec">${esc(t('files.locations'))}</div>
          <button type="button" class="on">${esc(t('files.inbox'))} <span class="cnt">${INVOICES.length}</span></button>
          <button type="button" disabled>${esc(t('files.archive'))}</button>
        </aside>
        <div class="files-main">
          <div class="files-bar">
            <span class="mono small">/Nova/Inbox/Invoices</span>
            <button type="button" class="btn btn-dark btn-sm" data-act="browser" ${state.selected ? '' : 'disabled'}>${esc(t('files.open_browser'))}</button>
          </div>
          <div class="files-list" role="listbox" aria-label="${esc(t('files.inbox'))}">
            ${INVOICES.map((i) => `
              <button type="button" role="option" class="frow ${state.selected === i.id ? 'sel' : ''}" aria-selected="${state.selected === i.id}" data-file="${i.id}">
                <span class="fic" aria-hidden="true">PDF</span>
                <span class="mono">${esc(i.file)}</span>
                <span class="muted">${esc(i.supplier)}</span>
                <span class="muted">${esc(d(i.date))}</span>
              </button>`).join('')}
          </div>
          <p class="muted small files-tip">${esc(t('files.tip'))}</p>
        </div>
      </div>`;
  }

  return { mount, render, select(id) { state.selected = id; render(); } };
}
