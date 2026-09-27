// Minimal desktop window manager for the demo environment.
// Windows can be opened, focused, closed and dragged by their title bar. Nothing more.
import { t } from '../i18n.js';

export class Desktop {
  constructor(root, dock) {
    this.root = root;
    this.dock = dock;
    this.apps = new Map();
    this.z = 10;
  }

  /** @param {{id, titleKey, title?, badgeStatus?, badgeKey?, icon, geometry:()=>{x,y,w,h}, mount:(body)=>void, onOpen?:()=>void}} app */
  register(app) {
    this.apps.set(app.id, { ...app, win: null, open: false });
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dock-item';
    b.dataset.app = app.id;
    b.innerHTML = `<span class="dock-ic" aria-hidden="true">${app.icon}</span><span class="dock-lbl"></span>`;
    b.addEventListener('click', () => (app.dockAction ? app.dockAction() : this.open(app.id)));
    this.dock.appendChild(b);
    this.relabel();
  }

  relabel() {
    this.apps.forEach((a) => {
      const b = this.dock.querySelector(`[data-app="${a.id}"]`);
      if (b) {
        b.querySelector('.dock-lbl').textContent = a.title || t(a.titleKey);
        b.setAttribute('aria-label', a.title || t(a.titleKey));
      }
      if (a.win) {
        a.win.querySelector('.win-title').textContent = a.title || t(a.titleKey);
        const badge = a.win.querySelector('.win-bar .badge');
        if (badge && a.badgeKey) badge.textContent = t(a.badgeKey);
        a.win.querySelector('.win-close').setAttribute('aria-label', t('xp.close_window'));
      }
    });
  }

  build(app) {
    const g = app.geometry(this.root.getBoundingClientRect());
    const w = document.createElement('section');
    w.className = 'win';
    w.dataset.app = app.id;
    w.setAttribute('aria-label', app.title || t(app.titleKey));
    Object.assign(w.style, { left: `${g.x}px`, top: `${g.y}px`, width: `${g.w}px`, height: `${g.h}px` });
    w.innerHTML = `
      <div class="win-bar">
        <span class="win-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="win-title"></span>
        ${app.badgeKey ? `<span class="badge" data-status="${app.badgeStatus || 'demo'}"></span>` : ''}
        <button type="button" class="win-close">×</button>
      </div>
      <div class="win-body"></div>`;
    w.querySelector('.win-close').addEventListener('click', () => this.close(app.id));
    w.addEventListener('pointerdown', () => this.focus(app.id), true);
    this.drag(w, w.querySelector('.win-bar'));
    this.root.appendChild(w);
    app.win = w;
    app.mount(w.querySelector('.win-body'));
    this.relabel();
  }

  open(id) {
    const app = this.apps.get(id);
    if (!app) return;
    if (!app.win) this.build(app);
    app.win.hidden = false;
    app.open = true;
    this.focus(id);
    this.syncDock();
    if (app.onOpen) app.onOpen();
  }

  close(id) {
    const app = this.apps.get(id);
    if (!app || !app.win) return;
    app.win.hidden = true;
    app.open = false;
    this.syncDock();
  }

  focus(id) {
    const app = this.apps.get(id);
    if (!app || !app.win) return;
    app.win.style.zIndex = ++this.z;
    this.root.querySelectorAll('.win').forEach((w) => w.classList.toggle('focused', w === app.win));
    this.syncDock();
  }

  syncDock() {
    this.apps.forEach((a) => {
      const b = this.dock.querySelector(`[data-app="${a.id}"]`);
      if (b) b.classList.toggle('open', !!a.open);
    });
  }

  drag(win, handle) {
    let sx, sy, ox, oy, dragging = false;
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      ox = win.offsetLeft; oy = win.offsetTop;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const r = this.root.getBoundingClientRect();
      const x = Math.min(Math.max(ox + e.clientX - sx, -win.offsetWidth + 120), r.width - 120);
      const y = Math.min(Math.max(oy + e.clientY - sy, 0), r.height - 60);
      win.style.left = `${x}px`;
      win.style.top = `${y}px`;
    });
    const stop = () => { dragging = false; };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  }
}
