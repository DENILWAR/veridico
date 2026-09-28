// Public runtime configuration for the static frontend (no build step, so Vercel env vars
// are NOT available in the browser). Edit this file per deployment.
//
// VERIDICO_API_URL: public base URL of the Verídico backend (Railway), no trailing slash,
//   e.g. 'https://veridico-backend-production.up.railway.app'.
//   It is NOT a secret. The SON Intelligence key never appears in the frontend.
//   Empty → the chat answers with the in-browser deterministic-demo provider and the lead form
//   shows its email alternative; the demo keeps working.
//   Also add this origin to connect-src in vercel.json (Content-Security-Policy).
export const VERIDICO_API_URL = '';
