// Demo configuration. Components read from here; nothing is hardcoded in UI code.
// In production, observation spans days/weeks/months with much higher thresholds;
// the demo accelerates that by detecting after DEMO_THRESHOLD similar executions.
import { VERIDICO_API_URL } from '../runtime-config.js';

const API_BASE = String(VERIDICO_API_URL || '').trim().replace(/\/+$/, '');
const params = new URLSearchParams(location.search);
const num = (key, fallback, min, max) => {
  const v = Number(params.get(key));
  return Number.isFinite(v) && v >= min && v <= max ? v : fallback;
};

export const DEMO_CONFIG = Object.freeze({
  DEMO_THRESHOLD: num('threshold', 3, 2, 10),  // executions needed to call a workflow "recurring"
  SIMILARITY_MIN: 0.75,                        // min pairwise sequence similarity (0–1) to group executions
  STEP_MAJORITY: 0.5,                          // a step belongs to the workflow if seen in > 50% of executions
  READ_DWELL_MS: 1200,                         // invoice kept open this long → "read invoice" event
  MOMENT_DELAY_MS: 900,                        // pause between the triggering save and Verídico's intervention
  ESTIMATE_MONTHLY_VOLUME: 250,                // ASSUMED monthly volume used for projections (editable in UI)
  MOBILE_BREAKPOINT: 1024,                     // below this, the desktop simulation is replaced by an adapted view
  API_BASE,                                    // Verídico backend (Railway); '' → offline fallbacks
  INTELLIGENCE_ENDPOINT: API_BASE ? `${API_BASE}/api/intelligence` : '',
  READY_ENDPOINT: API_BASE ? `${API_BASE}/ready` : '',
  LEADS_ENDPOINT: API_BASE ? `${API_BASE}/api/leads` : '',
  INTELLIGENCE_CLIENT_TIMEOUT_MS: 13000,       // > backend SON timeout (10 s) so the backend can fall back first
});
