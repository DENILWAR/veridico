import { z } from 'zod';

// Operational context built by the Verídico frontend (buildIntelligenceContext in
// assets/js/intelligence/gateway.js). Unknown fields are stripped; sizes are bounded.
const label = z.string().max(160);
const shortText = z.string().max(600);
const labels = z.array(label).max(24);

export const IntelligenceContextSchema = z.object({
  state: z.enum(['no_session', 'observing', 'session_ended', 'workflow_detected']),
  language: z.enum(['en', 'es', 'de']),
  about: z.object({
    product: label,
    what_it_is: shortText,
    how_it_works: z.array(shortText).max(8),
    demo_environment: shortText,
    not_available: z.array(shortText).max(8),
  }),
  session: z.object({
    status: z.enum(['idle', 'observing', 'ended']),
    event_count: z.number().int().min(0).max(100000),
    workflow_executions: z.number().int().min(0).max(10000),
    recurrence_threshold: z.number().int().min(1).max(100),
    duration_seconds: z.number().min(0).max(1e7),
  }),
  executions: z.array(z.object({
    id: z.number().int().min(0),
    invoice_id: z.string().max(40).nullable(),
    actions: z.number().int().min(0).max(10000),
    duration_seconds: z.number().min(0).max(1e7),
  })).max(50),
  workflow: z.object({
    key: z.string().max(60),
    name: label,
    occurrences: z.number().int().min(0).max(10000),
    similarity: z.number().min(0).max(1),
    average_duration_seconds: z.number().min(0).max(1e7),
    average_actions: z.number().min(0).max(10000),
    steps: labels,
    variants: z.array(z.object({
      step: label,
      kind: z.enum(['extra', 'skipped']),
      executions: z.number().int().min(0),
      of: z.number().int().min(0),
    })).max(24),
    detection_method: z.string().max(80),
  }).nullable(),
  recommendation: z.object({
    automation_potential: z.enum(['high', 'medium', 'low']),
    automatable_steps: labels,
    suggested_additions: labels,
    human_steps: labels,
    focus_areas: labels,
    repetitive_steps: z.number().int().min(0).max(100),
    total_steps: z.number().int().min(0).max(100),
    exceptions_observed: z.number().int().min(0).max(10000),
  }).nullable(),
  estimates: z.object({
    is_estimate: z.literal(true),
    basis: shortText,
    assumed_monthly_volume: z.number().min(0).max(1e7),
    manual_hours_per_month: z.number().min(0).max(1e7),
    recoverable_hours_per_month: z.number().min(0).max(1e7),
  }).nullable(),
});

export type IntelligenceContext = z.infer<typeof IntelligenceContextSchema>;

export const IntelligenceRequestSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  lang: z.enum(['en', 'es', 'de']).default('en'),
  session_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  context: IntelligenceContextSchema,
});

export type IntelligenceRequest = z.infer<typeof IntelligenceRequestSchema>;

/** Normalized response for the frontend. `output: null` + fallback → render deterministic-demo locally. */
export interface IntelligenceResponse {
  output: string | null;
  provider: 'son-intelligence' | 'deterministic-demo';
  request_id: string;
  fallback?: true;
  fallback_reason?: 'not_configured' | 'timeout' | 'unavailable' | 'bad_response';
}
