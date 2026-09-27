// Minimal i18n for the Verídico static site.
// - Dictionaries live in ./i18n/{en,es,de}.js (flat dot keys).
// - Markup uses data-i18n="key" (text), data-i18n-html="key" (trusted dictionary HTML)
//   and data-i18n-attr="placeholder:key;aria-label:key".
// - Language: ?lang= → localStorage → browser language → "en".
import en from './i18n/en.js';
import es from './i18n/es.js';
import de from './i18n/de.js';

const DICTS = { en, es, de };
export const LANGS = ['en', 'es', 'de'];
const STORE_KEY = 'veridico.lang';

function detect() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q && LANGS.includes(q)) { localStorage.setItem(STORE_KEY, q); return q; }
  } catch (e) { /* ignore */ }
  try {
    const s = localStorage.getItem(STORE_KEY);
    if (s && LANGS.includes(s)) return s;
  } catch (e) { /* storage blocked */ }
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return LANGS.includes(nav) ? nav : 'en';
}

let lang = detect();
document.documentElement.lang = lang;

export function getLang() { return lang; }

export function t(key, vars) {
  let s = DICTS[lang][key];
  if (s == null) s = DICTS.en[key];
  if (s == null) return key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return s;
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':').map((x) => x.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    });
  });
  const titleKey = document.documentElement.dataset.titleKey;
  if (titleKey) document.title = t(titleKey);
}

export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  lang = next;
  try { localStorage.setItem(STORE_KEY, next); } catch (e) { /* ignore */ }
  document.documentElement.lang = next;
  applyI18n();
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: next } }));
}

export function mountLangSwitcher(el) {
  if (!el) return;
  el.classList.add('lang');
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Language');
  el.innerHTML = '';
  LANGS.forEach((l) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = l.toUpperCase();
    b.setAttribute('aria-pressed', String(l === lang));
    b.addEventListener('click', () => setLang(l));
    el.appendChild(b);
  });
  document.addEventListener('langchange', () => {
    el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.textContent.toLowerCase() === lang)));
  });
}

/* Locale-aware helpers */
export function fmtNumber(n, digits = 0) {
  return new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}
export function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}
