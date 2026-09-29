// Observation session: records real UI events and segments them into workflow executions.
// An execution starts at `crm.invoice.open` and completes at `crm.invoice.save` for the
// same invoice. Follow-up events (e.g. `crm.queue.return`) attach to it until the next open.
// Opening another invoice before saving marks the current execution as abandoned.

export class ObservationSession extends EventTarget {
  constructor() {
    super();
    this.reset();
  }

  reset() {
    this.id = null;                // opaque id sent as session_id (no personal data)
    this.status = 'idle';          // idle | observing | ended
    this.events = [];
    this.executions = [];
    this.current = null;
    this.startedAt = null;
    this.endedAt = null;
    this.detection = null;
    this._seq = 0;
  }

  start() {
    this.reset();
    this.id = newId();
    this.status = 'observing';
    this.startedAt = Date.now();
    this.emit('status');
  }

  end() {
    if (this.status !== 'observing') return;
    this.status = 'ended';
    this.endedAt = Date.now();
    this.emit('status');
  }

  /** Record an event produced by a user action inside the demo environment. */
  record(type, { app, entity, data, demoGenerated } = {}) {
    if (this.status !== 'observing') return null;
    const ev = { id: ++this._seq, type, ts: Date.now(), app: app || null, entity: entity || null, data: data || {} };
    // DEMO FAST-FORWARD events are marked; the detector only reads type/ts/entity, so it is unaffected.
    if (demoGenerated) ev.demo_generated = true;
    this.events.push(ev);

    if (type === 'crm.invoice.open') {
      if (this.current && !this.current.complete) this.current.abandoned = true;
      this.current = {
        id: this.executions.length + 1,
        invoiceId: entity && entity.id,
        events: [],
        startedAt: ev.ts,
        endedAt: null,
        complete: false,
        abandoned: false,
        demoGenerated: !!demoGenerated,
      };
      this.executions.push(this.current);
    }

    const cur = this.current;
    if (cur && !cur.abandoned) {
      // Events about another invoice don't belong to this execution.
      const other = entity && entity.type === 'invoice' && entity.id !== cur.invoiceId;
      if (!other && !(cur.complete && !isTrailing(type))) {
        cur.events.push(ev);
        if (demoGenerated) cur.demoGenerated = true;
      }
      if (type === 'crm.invoice.save' && !cur.complete && entity && entity.id === cur.invoiceId) {
        cur.complete = true;
        cur.endedAt = ev.ts;
        this.emit('event', ev);
        this.emit('execution', cur);
        return ev;
      }
    }
    this.emit('event', ev);
    return ev;
  }

  completed() { return this.executions.filter((e) => e.complete); }

  emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { detail })); }
}

export function newId() {
  const c = globalThis.crypto;
  const raw = c && c.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `vs_${raw.replace(/[^A-Za-z0-9]/g, '').slice(0, 32)}`;
}

function isTrailing(type) { return type === 'crm.queue.return'; }
