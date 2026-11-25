import { test as base, expect, type APIResponse } from '@playwright/test';

// API evidence. Every call made through the `request` fixture is recorded (method, URL, status, time, request and
// response bodies without secrets). Each call becomes a step in the timeline plus one `api-call-N` JSON attachment
// that the test tracker renders. No browser is started for API tests.
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch']);
const SECRET_HEADER = /^(authorization|cookie|set-cookie|proxy-authorization|x-api-key|x-wp-nonce)$/i;
const SECRET_FIELD = /(pass(word)?|token|secret|authorization|api[-_]?key|nonce)/i;
const LIMIT = 4000;

// Masks secret-looking keys anywhere in a JSON value.
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, SECRET_FIELD.test(key) ? '***' : redact(inner)]));
  }
  return value;
}

function show(body: unknown): string | undefined {
  if (body === undefined || body === null || body === '') return undefined;
  let text: string;
  if (Buffer.isBuffer(body)) text = '(binary, ' + body.length + ' bytes)';
  else if (typeof body === 'string') {
    try {
      text = JSON.stringify(redact(JSON.parse(body)), null, 2);
    } catch {
      text = body;
    }
  } else text = JSON.stringify(redact(body), null, 2);
  return text.length > LIMIT ? text.slice(0, LIMIT) + '\n... (' + (text.length - LIMIT) + ' more characters)' : text;
}

const maskHeaders = (headers?: Record<string, string>) =>
  headers ? Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, SECRET_HEADER.test(key) ? '***' : value])) : undefined;

export const test = base.extend({
  request: async ({ request }, use, testInfo) => {
    let count = 0;
    const record = (method: string) => async (url: string, options?: Record<string, any>): Promise<APIResponse> => {
      const label = method.toUpperCase();
      let path = url;
      try {
        const parsed = new URL(url);
        path = parsed.pathname + parsed.search;
      } catch {
        // relative URL: keep as is
      }
      const started = Date.now();
      return base.step(label + ' ' + path, async () => {
        const response: APIResponse = await (request as any)[method](url, options);
        const ms = Date.now() - started;
        let responseText: string | undefined;
        try {
          responseText = await response.text();
        } catch {
          // body not available (e.g. HEAD)
        }
        const call = {
          method: label,
          url,
          status: response.status(),
          statusText: response.statusText(),
          ms,
          requestHeaders: maskHeaders(options?.headers),
          requestBody: show(options?.data ?? options?.form),
          responseBody: show(responseText),
        };
        await testInfo.attach('api-call-' + ++count, { body: JSON.stringify(call), contentType: 'application/json' });
        await base.step('Response ' + call.status + ' ' + call.statusText + ' (' + ms + ' ms)', async () => {});
        return response;
      });
    };
    const wrapped = new Proxy(request, {
      get(target, prop) {
        const value = (target as any)[prop];
        if (typeof prop === 'string' && METHODS.has(prop) && typeof value === 'function') return record(prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    await use(wrapped);
  },
});

export { expect };
