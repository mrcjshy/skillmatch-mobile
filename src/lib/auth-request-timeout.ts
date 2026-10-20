/**
 * A deadline for Supabase Auth requests only.
 *
 * React Native's Android HTTP client has no connect or read timeout, and auth-js adds
 * none. auth-js runs one refresh at a time, so a single refresh that is never answered
 * keeps every later refresh and Try again waiting on it, even after Auth recovers.
 *
 * Only `<supabaseUrl>/auth/v1/…` requests are bounded; database, Storage and function
 * requests pass through untouched. A deadline aborts the request and rejects like a
 * network failure (a TypeError), which auth-js reports as a retryable connection error,
 * so a timeout never signs anyone out. A late answer after the deadline is ignored.
 */
export const AUTH_REQUEST_TIMEOUT_MS = 20_000;

export class AuthRequestTimeoutError extends TypeError {
  constructor(timeoutMs: number) {
    super(`Auth request timed out after ${timeoutMs} ms`);
    this.name = 'AuthRequestTimeoutError';
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function abortError(reason: unknown): Error {
  if (reason instanceof Error && reason.name === 'AbortError') return reason;
  const error = new Error('The request was aborted.');
  error.name = 'AbortError';
  return error;
}

export function withAuthRequestTimeout(
  supabaseUrl: string,
  options: { timeoutMs?: number; fetch?: typeof fetch } = {}
): typeof fetch {
  const timeoutMs = options.timeoutMs ?? AUTH_REQUEST_TIMEOUT_MS;
  const authPrefix = supabaseUrl.replace(/\/+$/, '') + '/auth/v1/';
  // Resolved per call so React Native's installed fetch (or a test stub) is the one used.
  const send: typeof fetch = (input, init) => (options.fetch ?? globalThis.fetch)(input, init);

  return (input, init) => {
    if (!requestUrl(input).startsWith(authPrefix)) return send(input, init);

    const callerSignal =
      init?.signal ?? (typeof input === 'object' && !(input instanceof URL) ? input.signal : undefined);
    if (callerSignal?.aborted) return Promise.reject(abortError(callerSignal.reason));

    // Aborting cancels the native request where supported (whatwg-fetch -> XHR -> OkHttp);
    // the race below settles the promise even if the cancellation never lands.
    const controller = new AbortController();
    return new Promise<Response>((resolve, reject) => {
      let finished = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = () => {
        finished = true;
        if (timer !== undefined) clearTimeout(timer);
        callerSignal?.removeEventListener('abort', onCallerAbort);
      };
      function onCallerAbort() {
        if (finished) return;
        finish();
        controller.abort();
        reject(abortError(callerSignal?.reason));
      }
      timer = setTimeout(() => {
        if (finished) return;
        finish();
        controller.abort();
        reject(new AuthRequestTimeoutError(timeoutMs));
      }, timeoutMs);
      callerSignal?.addEventListener('abort', onCallerAbort);

      try {
        send(input, { ...init, signal: controller.signal }).then(
          (response) => {
            if (finished) return;
            finish();
            resolve(response);
          },
          (error: unknown) => {
            if (finished) return;
            finish();
            reject(error);
          }
        );
      } catch (error) {
        finish();
        reject(error);
      }
    });
  };
}
