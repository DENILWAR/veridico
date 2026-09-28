// deterministic-demo fallback.
//
// The deterministic provider already exists and is proven: DemoIntelligenceProvider in
// assets/js/intelligence/gateway.js answers the supported questions (EN/ES/DE) from the real
// session, the detected workflow and the recommendation. It is not duplicated here.
//
// When SON Intelligence is not configured, times out or fails, the backend returns an explicit
// fallback directive (`output: null`, `provider: "deterministic-demo"`); the frontend then renders
// the answer with that single implementation. The same provider also covers the case where this
// backend itself is unreachable, so the demo never shows an error screen.
import type { IntelligenceResponse } from '../schemas/intelligence.js';

export type FallbackReason = NonNullable<IntelligenceResponse['fallback_reason']>;

export function deterministicFallback(requestId: string, reason: FallbackReason): IntelligenceResponse {
  return {
    output: null,
    provider: 'deterministic-demo',
    request_id: requestId,
    fallback: true,
    fallback_reason: reason,
  };
}
