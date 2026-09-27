// Landing: i18n, portal routing (denilsonarnau.com entry), hero workflow composition.
import { applyI18n, mountLangSwitcher, t } from './i18n.js';
import { Flow, chain, hub, flash, isActive, REDUCE } from './flow.js';
import { portalArrive, portalEnter, experienceUrl } from './portal.js';

applyI18n();
mountLangSwitcher(document.getElementById('langSwitch'));

/* ── Routing from denilsonarnau.com ────────────────────────────────
   /?source=denilsonarnau              → portal, then land on the hero.
   /?source=denilsonarnau&q=<question> → portal, straight to Verídico Intelligence chat. */
const params = new URLSearchParams(location.search);
const q = (params.get('q') || '').trim().slice(0, 500);
if (q) {
  // Stay covered by the portal and continue it on the Intelligence side.
  location.replace(experienceUrl({ view: 'intelligence', q, source: params.get('source') }));
} else if (document.documentElement.classList.contains('portal-boot')) {
  portalArrive({ label: t('portal.arriving') });
  history.replaceState(null, '', location.pathname + location.hash);
}

/* ── Landing → Intelligence through the portal ─────────────────── */
document.querySelectorAll('[data-experience]').forEach((a) => {
  a.addEventListener('click', async (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return; // allow open-in-new-tab
    e.preventDefault();
    await portalEnter({ label: t('portal.entering') });
    location.href = experienceUrl();
  });
});

/* ── Nav + reveal ─────────────────────────────────────────────── */
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

const io = new IntersectionObserver((entries) => {
  entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('visible'); io.unobserve(en.target); } });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

/* ── Hero: events arrive and compose "Invoice Processing" ─────── */
const heroFlow = new Flow(document.getElementById('heroFlow'));
const card = heroFlow.node('wf');
const evs = [...heroFlow.root.querySelectorAll('.ev')];
const steps = [...card.querySelectorAll('.wf-steps li')];
const state = document.getElementById('wfState');

function resetHero() {
  evs.forEach((e) => e.classList.remove('seen'));
  steps.forEach((s) => s.classList.remove('on'));
  card.classList.remove('formed');
  state.textContent = t('hero.observing');
}
function runHero(i = 0) {
  if (!isActive(heroFlow)) { setTimeout(() => runHero(i), 500); return; }
  if (i === 0) resetHero();
  if (i >= evs.length) {
    card.classList.add('formed');
    state.textContent = t('hero.detected');
    setTimeout(() => runHero(0), 3200);
    return;
  }
  const ev = evs[i];
  ev.classList.add('seen');
  flash(ev, 'emit', 800);
  const link = heroFlow.links.find((l) => l.a === ev);
  heroFlow.pulse(link, { dur: 700, onEnd: () => {
    steps[i].classList.add('on');
    flash(card, 'hit', 500);
    setTimeout(() => runHero(i + 1), REDUCE ? 400 : 260);
  } });
}
if (REDUCE) {
  evs.forEach((e) => e.classList.add('seen'));
  steps.forEach((s) => s.classList.add('on'));
  card.classList.add('formed');
  state.textContent = t('hero.detected');
} else {
  setTimeout(() => runHero(0), 600);
}
document.addEventListener('langchange', () => {
  state.textContent = card.classList.contains('formed') ? t('hero.detected') : t('hero.observing');
});

chain(new Flow(document.getElementById('cycleFlow')), { hold: 1200, dur: 520, gap: 160, rest: 900 });
hub(new Flow(document.getElementById('obsFlow')), 'core', { every: 1300 });
