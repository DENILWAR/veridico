// Client for the existing, deployed SON Intelligence Gateway.
// Verídico sends only: the user's question (input), Verídico's operational context and a session id.
// Model, provider, temperature, tools and prompts are SON Intelligence's decisions — never sent from here.

export type SonErrorKind = 'timeout' | 'unavailable' | 'bad_response';

export class SonIntelligenceError extends Error {
  constructor(public readonly kind: SonErrorKind, public readonly status?: number) {
    super(`son-intelligence ${kind}${status ? ` (${status})` : ''}`);
    this.name = 'SonIntelligenceError';
  }
}

export interface SonAskInput {
  input: string;
  context: unknown;
  sessionId?: string;
  requestId: string;
}

export interface SonAskResult {
  output: string;
  requestId: string;
}

export interface SonIntelligenceClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

const MAX_OUTPUT_CHARS = 8000;

export class SonIntelligenceClient {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: SonIntelligenceClientOptions) {
    this.endpoint = `${opts.baseUrl.replace(/\/+$/, '')}/v1/ask`;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async ask({ input, context, sessionId, requestId }: SonAskInput): Promise<SonAskResult> {
    const body = {
      input,
      context,
      metadata: { session_id: sessionId ?? requestId },
    };

    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Request-Id': requestId,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
    } catch (err) {
      const name = (err as Error)?.name;
      throw new SonIntelligenceError(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unavailable');
    }

    if (!res.ok) throw new SonIntelligenceError(res.status >= 500 || res.status === 429 ? 'unavailable' : 'bad_response', res.status);

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new SonIntelligenceError('bad_response', res.status);
    }
    const d = (data ?? {}) as Record<string, unknown>;
    const output = typeof d.output === 'string' ? d.output : typeof d.answer === 'string' ? d.answer : null;
    if (!output || !output.trim()) throw new SonIntelligenceError('bad_response', res.status);

    const upstreamId = typeof d.request_id === 'string' ? d.request_id : res.headers.get('x-request-id');
    return {
      output: output.slice(0, MAX_OUTPUT_CHARS),
      requestId: upstreamId && /^[A-Za-z0-9._:-]{1,128}$/.test(upstreamId) ? upstreamId : requestId,
    };
  }
}
