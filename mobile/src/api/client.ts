/**
 * The one way the app talks to the server (ADR-027).
 *
 * - Every request has a time limit (15 s by default).
 * - Failures become an `ApiError` carrying the server's error code (the contract's
 *   identifiers, e.g. `AUTH_401_INVALID_CREDENTIALS`) and, for rate limits, how long to wait.
 * - Nothing here logs: request bodies hold PINs and codes, responses hold tokens.
 */

import { API_BASE_URL } from './config';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type Fetch = typeof fetch;

export interface RequestOptions {
  body?: unknown;
  /** Bearer token (access or refresh token, depending on the endpoint). */
  token?: string | null;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Tests inject these; the app uses the defaults. */
  fetchImpl?: Fetch;
  baseUrl?: string | null;
}

export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const base = options.baseUrl === undefined ? API_BASE_URL : options.baseUrl;
  if (!base) throw new ApiError('APP_NOT_CONFIGURED', 0, 'This version of the app is not connected to Xspeeria.');
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await doFetch(`${base}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('NETWORK', 0, 'Can’t reach Xspeeria. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (response.ok) return data as T;

  const err = (data as { error?: { code?: unknown; message?: unknown; details?: { retry_after_seconds?: unknown } } } | null)?.error;
  const code = typeof err?.code === 'string' ? err.code : `HTTP_${response.status}`;
  const message = typeof err?.message === 'string' ? err.message : 'Something went wrong. Please try again.';
  const retry = err?.details?.retry_after_seconds;
  throw new ApiError(code, response.status, message, typeof retry === 'number' && retry > 0 ? retry : null);
}

/** Wording for the user. Server messages are already written for users; a few are tuned. */
export function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (error.code === 'AUTH_429_RATE_LIMITED' && error.retryAfterSeconds) {
    const minutes = Math.ceil(error.retryAfterSeconds / 60);
    return error.retryAfterSeconds < 90
      ? `Too many attempts. Try again in ${error.retryAfterSeconds} seconds.`
      : `Too many attempts. Try again in ${minutes} minutes.`;
  }
  if (error.code === 'SYS_503_SERVICE_UNAVAILABLE') return 'This isn’t available right now. Please try again later.';
  return error.message;
}
