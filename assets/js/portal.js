// Verídico Portal — short black-hole transition.
//   portalArrive(): entry continuity (from denilsonarnau.com, or after Landing → Intelligence).
//   portalEnter():  leaving the landing towards Verídico Intelligence.
// Markup: <div class="portal" id="portal" aria-hidden="true"></div> placed first in <body>.
// An inline <head> script adds html.portal-boot when an entry param is present, so the
// page never flashes before the portal plays. Click / key skips.
import { REDUCE } from './flow.js';

const PARTICLES = 14;

function build(el, label) {
  el.innerHTML = '';
  const hole = document.createElement('div'); hole.className = 'portal-hole';
  const r1 = document.createElement('div'); r1.className = 'portal-ring';
  const r2 = document.createElement('div'); r2.className = 'portal-ring r2';
  el.append(r2, r1, hole);
  for (let i = 0; i < PARTICLES; i++) {
    const p = document.createElement('span');
    p.className = 'portal-p';
    p.style.setProperty('--a', `${Math.round((360 / PARTICLES) * i + Math.random() * 20)}deg`);
    p.style.setProperty('--r', `${120 + Math.round(Math.random() * 140)}px`);
    p.style.animationDelay = `${Math.round(Math.random() * 180)}ms`;
    el.appendChild(p);
  }
  const l = document.createElement('div'); l.className = 'portal-label'; l.textContent = label || '';
  el.appendChild(l);
}

function run(mode, { label, duration } = {}) {
  const el = document.getElementById('portal');
  if (!el) return Promise.resolve();
  build(el, label);
  el.className = `portal on ${mode}`;
  const ms = REDUCE ? 260 : duration || (mode === 'enter' ? 950 : 1350);
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      el.removeEventListener('click', finish);
      window.removeEventListener('keydown', finish);
      resolve(el);
    };
    el.addEventListener('click', finish);
    window.addEventListener('keydown', finish);
    setTimeout(finish, ms);
  });
}

export async function portalArrive(opts) {
  const p = run('arrive', opts);
  requestAnimationFrame(() => document.documentElement.classList.remove('portal-boot'));
  const el = await p;
  el.className = 'portal';
  el.innerHTML = '';
}

export async function portalEnter(opts) {
  document.documentElement.classList.remove('portal-boot');
  await run('enter', opts);
}

/* Build an Experience URL, carrying language and optional deep-link params. */
export function experienceUrl(params = {}) {
  const u = new URL('experience.html', location.href);
  u.searchParams.set('entry', 'portal');
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') u.searchParams.set(k, v); });
  return u.pathname + u.search;
}
