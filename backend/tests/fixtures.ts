import type { IntelligenceContext } from '../src/schemas/intelligence.js';
import { loadConfig, type Config } from '../src/config.js';

const about = {
  product: 'Verídico Intelligence',
  what_it_is: 'Operational intelligence that observes how a team works and recommends automation.',
  how_it_works: ['Every action becomes an event.'],
  demo_environment: 'Fictitious company, ORDR demo CRM.',
  not_available: ['Production integrations (planned).'],
};

export const detectedContext: IntelligenceContext = {
  state: 'workflow_detected',
  language: 'en',
  about,
  session: { status: 'observing', event_count: 27, workflow_executions: 3, recurrence_threshold: 3, duration_seconds: 410 },
  executions: [
    { id: 1, invoice_id: 'INV-2026-0418', actions: 9, duration_seconds: 210 },
    { id: 2, invoice_id: 'INV-2026-0419', actions: 11, duration_seconds: 240 },
    { id: 3, invoice_id: 'INV-2026-0420', actions: 9, duration_seconds: 216 },
  ],
  workflow: {
    key: 'invoice_processing', name: 'Invoice Processing', occurrences: 3, similarity: 0.94,
    average_duration_seconds: 222, average_actions: 9.7,
    steps: ['Open invoice', 'Search client', 'Select client', 'Classify document', 'Change status', 'Create follow-up task', 'Save'],
    variants: [], detection_method: 'deterministic_sequence_similarity',
  },
  recommendation: {
    automation_potential: 'high',
    automatable_steps: ['Detect and match the client', 'Classify the document'],
    suggested_additions: ['Prepare the client confirmation'],
    human_steps: ['Validate exceptions'], focus_areas: ['Exceptions'],
    repetitive_steps: 7, total_steps: 7, exceptions_observed: 0,
  },
  estimates: {
    is_estimate: true, basis: 'observed average duration × assumed monthly volume',
    assumed_monthly_volume: 250, manual_hours_per_month: 15.4, recoverable_hours_per_month: 15.4,
  },
};

export const noSessionContext: IntelligenceContext = {
  state: 'no_session',
  language: 'en',
  about,
  session: { status: 'idle', event_count: 0, workflow_executions: 0, recurrence_threshold: 3, duration_seconds: 0 },
  executions: [],
  workflow: null,
  recommendation: null,
  estimates: null,
};

export function testConfig(env: Record<string, string> = {}): Config {
  return loadConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://preview.example.com', ...env });
}

export const SON_ENV = { SON_INTELLIGENCE_URL: 'https://son.example.com', SON_INTELLIGENCE_KEY: 'test-key-not-real' };
