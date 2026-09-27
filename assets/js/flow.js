// Intelligence Pulse — shared SVG connection engine.
// A .flow container holds an <svg class="flow-svg"> plus nodes marked with
// data-node="id" and data-to="id id…". Links are drawn centre-to-centre
// beneath the (opaque) nodes; pulse() sends a luminous segment along a link.
export const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, cls) {
  const e = document.createElementNS(NS, tag);
  if (cls) e.setAttribute('class', cls);
  return e;
}
export function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
export function pick(arr, not) {
  if (!arr.length) return null;
  if (arr.length === 1) return arr[0];
  let x;
  do { x = arr[Math.floor(Math.random() * arr.length)]; } while (x === not);
  return x;
}
/* Restartable CSS state flash (class on → off after ms) */
export function flash(el, cls, ms = 1000) {
  if (!el) return;
  const key = '_t_' + cls;
  clearTimeout(el[key]);
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el[key] = setTimeout(() => el.classList.remove(cls), ms);
}

/* One rAF loop shared by every animation task */
const tasks = [];
let looping = false;
function frame(now) {
  for (let i = tasks.length - 1; i >= 0; i--) {
    const t = tasks[i];
    if (t.t0 == null) t.t0 = now;
    const k = Math.min(1, (now - t.t0) / t.dur);
    t.update(k);
    if (k >= 1) { tasks.splice(i, 1); t.done && t.done(); }
  }
  if (tasks.length) requestAnimationFrame(frame); else looping = false;
}
export function addTask(t) {
  tasks.push(t);
  if (!looping) { looping = true; requestAnimationFrame(frame); }
}

export class Flow {
  constructor(root) {
    this.root = root;
    this.svg = root.querySelector('.flow-svg');
    this.base = svgEl('g');
    this.fx = svgEl('g');
    this.svg.append(this.base, this.fx);
    this.links = [];
    this.visible = false;
    root.querySelectorAll('[data-to]').forEach((a) => {
      a.dataset.to.split(/\s+/).forEach((id) => {
        const b = root.querySelector(`[data-node="${id}"]`);
        if (!b) return;
        const p = svgEl('path', 'flow-line');
        this.base.appendChild(p);
        this.links.push({ a, b, from: a.dataset.node, to: id, path: p, len: 0 });
      });
    });
    this.layout();
    new ResizeObserver(() => this.layout()).observe(root);
    new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; }, { threshold: 0.15 }).observe(root);
  }
  node(id) { return this.root.querySelector(`[data-node="${id}"]`); }
  layout() {
    const r = this.root.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    const ds = this.root.dataset;
    let mode = ds.mode || 'h';
    if (mode === 'auto') mode = r.width >= (+ds.bp || 760) ? (ds.wide || 'h') : (ds.narrow || 'v');
    const c = (el) => {
      const q = el.getBoundingClientRect();
      return { x: q.left - r.left + q.width / 2, y: q.top - r.top + q.height / 2 };
    };
    this.links.forEach((l) => {
      const p = c(l.a), q = c(l.b);
      let d;
      if (mode === 'line') d = `M${p.x},${p.y} L${q.x},${q.y}`;
      else if (mode === 'v') { const m = (q.y - p.y) / 2; d = `M${p.x},${p.y} C${p.x},${p.y + m} ${q.x},${q.y - m} ${q.x},${q.y}`; }
      else { const m = (q.x - p.x) / 2; d = `M${p.x},${p.y} C${p.x + m},${p.y} ${q.x - m},${q.y} ${q.x},${q.y}`; }
      l.path.setAttribute('d', d);
      l.len = l.path.getTotalLength();
    });
  }
  pulse(link, { dur, onEnd } = {}) {
    const done = onEnd || (() => {});
    link.path.classList.add('lit');
    if (REDUCE || !link.len) {
      setTimeout(() => { link.path.classList.remove('lit'); done(); }, 240);
      return;
    }
    const d = link.path.getAttribute('d');
    const L = link.len;
    const seg = Math.min(80, L * 0.4);
    const glow = svgEl('path', 'pulse-glow');
    const trail = svgEl('path', 'pulse-trail');
    const halo = svgEl('circle', 'pulse-halo');
    const dot = svgEl('circle', 'pulse-dot');
    [glow, trail].forEach((p) => {
      p.setAttribute('d', d);
      p.style.strokeDasharray = `${seg} ${L + seg}`;
      p.style.strokeDashoffset = seg;
    });
    halo.setAttribute('r', 8);
    dot.setAttribute('r', 2.6);
    this.fx.append(glow, trail, halo, dot);
    addTask({
      dur: dur || Math.max(600, Math.min(1400, L * 2.4)),
      update: (k) => {
        const s = ease(k) * L;
        glow.style.strokeDashoffset = trail.style.strokeDashoffset = seg - s;
        const pt = link.path.getPointAtLength(s);
        halo.setAttribute('cx', pt.x); halo.setAttribute('cy', pt.y);
        dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
      },
      done: () => {
        [glow, trail, halo, dot].forEach((e) => e.remove());
        setTimeout(() => link.path.classList.remove('lit'), 350);
        done();
      },
    });
  }
}

export function isActive(flow) { return flow.visible && !document.hidden; }

/* Hub pattern: inputs → core → outputs, looping while visible */
export function hub(flow, coreId, o = {}) {
  const core = flow.node(coreId);
  const ins = flow.links.filter((l) => l.to === coreId);
  const outs = flow.links.filter((l) => l.from === coreId);
  let last = null;
  const tick = () => {
    if (isActive(flow) && ins.length) {
      const a = pick(ins, last); last = a;
      flash(a.a, 'emit', 900);
      flow.pulse(a, { onEnd: () => {
        flash(core, 'hit', 700);
        const b = pick(outs);
        if (b) setTimeout(() => flow.pulse(b, { onEnd: () => flash(b.b, 'active', 1400) }), 140);
      } });
    }
    setTimeout(tick, (o.every || 1500) * (0.8 + Math.random() * 0.4));
  };
  setTimeout(tick, o.delay || 400);
}

/* Chain pattern: n1 → n2 → … → nN, looping while visible */
export function chain(flow, o = {}) {
  const nodes = [...flow.root.querySelectorAll('[data-node]')];
  const seq = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const l = flow.links.find((x) => x.a === nodes[i] && x.b === nodes[i + 1]);
    if (l) seq.push(l);
  }
  const hold = o.hold || 1100;
  const step = (i) => {
    if (i === 0) flash(nodes[0], 'active', hold);
    if (i >= seq.length) { setTimeout(start, o.rest || 1000); return; }
    flow.pulse(seq[i], { dur: o.dur, onEnd: () => {
      flash(seq[i].b, 'active', hold);
      setTimeout(() => step(i + 1), o.gap || 60);
    } });
  };
  const start = () => {
    if (!isActive(flow)) { setTimeout(start, 500); return; }
    step(0);
  };
  setTimeout(start, o.delay || 300);
}
