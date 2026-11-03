/** The adverts for the Market screen's advert slot (ADR-067; ADR-086). Read-only. */

import { API_BASE_URL } from './config';
import { apiRequest, type RequestOptions } from './client';

export interface ServerAdvert {
  id: string;
  name: string;
  /** Opens when tapped; always https (checked by the server and again here). */
  link_url: string | null;
  width: number;
  height: number;
  /** Server path of the picture; needs the signed-in token. */
  image_path: string;
}

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;

/** ADR-086: the adverts taking turns now, newest first, and how long each stays. */
export interface ShowingAdverts {
  rotate_seconds: number;
  items: ServerAdvert[];
}

export const advertsApi = {
  showing: (token: string, x: Extra = {}) => apiRequest<ShowingAdverts>('GET', '/api/v1/adverts/showing', { token, ...x }),
};

/** What <Image source> needs to load the picture with the token, or null without a server. */
export function advertImageSource(
  a: ServerAdvert,
  token: string,
  baseUrl: string | null = API_BASE_URL,
): { uri: string; headers: Record<string, string> } | null {
  if (!baseUrl || !/^\/api\/v1\/adverts\/[0-9a-f-]{36}\/image$/.test(a.image_path)) return null;
  return { uri: `${baseUrl}${a.image_path}`, headers: { Authorization: `Bearer ${token}` } };
}

/**
 * Browsers (the app's web build, used for local testing) can't send headers with an <img>, so
 * the picture would come back 401. There, download it with the token and show a local
 * object URL instead. Phones keep the header source. Returns null if the download fails.
 */
export async function loadForWeb(
  source: { uri: string; headers: Record<string, string> },
  fetchFn: typeof fetch = fetch,
  toUrl: (b: Blob) => string = (b) => URL.createObjectURL(b),
): Promise<{ uri: string; headers: Record<string, string> } | null> {
  try {
    const r = await fetchFn(source.uri, { headers: source.headers });
    if (!r.ok) return null;
    return { uri: toUrl(await r.blob()), headers: {} };
  } catch {
    return null;
  }
}

/** Only full https links open (never javascript:, http: or app-internal schemes). */
export function safeAdvertLink(url: string | null): string | null {
  return url && /^https:\/\/[^\s<>"]+$/.test(url) ? url : null;
}
