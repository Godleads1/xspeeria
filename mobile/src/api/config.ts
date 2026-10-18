/**
 * Where the app finds the Xspeeria server (ADR-027).
 *
 * `EXPO_PUBLIC_API_URL` is read at build time (Expo inlines `EXPO_PUBLIC_*`). It must be
 * `https://…`; plain `http://` is accepted only for this computer or a private home/office
 * network address, so a development build can talk to a server on the developer's laptop.
 *
 * Server mode is for development builds only for now: the rest of the app (marketplace,
 * trades, profile data) is still demo data, and release builds never run demo data
 * (ADR-018), so a release build still shows "not available".
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

/** True when a development build is pointed at a real server. */
export const SERVER_MODE: boolean = DEMO_MODE && API_BASE_URL !== null;
