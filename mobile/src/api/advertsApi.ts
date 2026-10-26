/** The advert for the Market screen's advert slot (ADR-067). Read-only. */

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

export const advertsApi = {
  current: (token: string, x: Extra = {}) => apiRequest<ServerAdvert | null>('GET', '/api/v1/adverts/current', { token, ...x }),
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

/** Only full https links open (never javascript:, http: or app-internal schemes). */
export function safeAdvertLink(url: string | null): string | null {
  return url && /^https:\/\/[^\s<>"]+$/.test(url) ? url : null;
}
