/**
 * Where the app finds the Xspeeria server (ADR-027).
 *
 * `EXPO_PUBLIC_API_URL` is read at build time (Expo inlines `EXPO_PUBLIC_*`). It must be
 * `https://…`; plain `http://` is accepted only for this computer or a private home/office
 * network address, so a development build can talk to a server on the developer's laptop.
 *
 * Server mode (ADR-096, owner 2026-11-03): a development build pointed at a server, or a
 * **release build with an `https://` server address**. A release build never runs demo data
 * (ADR-018): without a server it still shows "not available", and the screens that only exist
 * for the demo send it to Home (`DemoOnly`).
 */

import { DEMO_MODE } from '../features/auth/demo';

const PRIVATE_HOST = [
  /^localhost$/,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
];

/** A clean base URL (no trailing slash), or null if missing or unsafe. */
export function parseApiUrl(raw: string | undefined | null): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  const m = /^(https?):\/\/([A-Za-z0-9.-]+)(:\d{1,5})?(\/[A-Za-z0-9._~\-/]*)?$/.exec(value);
  if (!m) return null; // no credentials, query, fragment or odd characters
  const [, scheme, host, port = '', path = ''] = m;
  if (scheme === 'http' && !PRIVATE_HOST.some((re) => re.test(host))) return null;
  return `${scheme}://${host}${port}${path.replace(/\/+$/, '')}`;
}

export const API_BASE_URL: string | null = parseApiUrl(process.env.EXPO_PUBLIC_API_URL);

/** Pure rule, exported for tests (ADR-096): a server address, and https:// in a release build. */
export function isServerMode(demoBuild: boolean, apiUrl: string | null): boolean {
  if (apiUrl === null) return false;
  return demoBuild || apiUrl.startsWith('https://');
}

/** True when the app talks to a real server. */
export const SERVER_MODE: boolean = isServerMode(DEMO_MODE, API_BASE_URL);
