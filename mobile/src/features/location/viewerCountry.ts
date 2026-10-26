/**
 * The country used for the marketplace location rule (ADR-059 Decision 2, rule A): nobody
 * sees listings that sell their own country's currency.
 *
 * Only the two-letter country code is kept, in memory for this app session; coordinates are
 * dropped inside `detectCountry` (ADR-022). The code is sent as the `X-Device-Country` header
 * on market listings only. It is a visibility hint: the server falls back to the approved
 * identity check's country, and the country never decides money, limits or permissions.
 */

import { detectCountry, type CountryResult } from '../auth/location';

type Detect = (options: { ask: boolean }) => Promise<CountryResult>;

export interface ViewerCountry {
  /** The phone's country, asking for permission only when `ask` is true. Null if unknown. */
  get(options: { ask: boolean }): Promise<string | null>;
  /** Forget the remembered country (e.g. at log-out, or to look again after travelling). */
  reset(): void;
}

export function makeViewerCountry(detect: Detect = detectCountry): ViewerCountry {
  let found: string | null = null;
  let pending: Promise<string | null> | null = null;
  return {
    async get({ ask }) {
      if (found) return found;
      if (pending) return pending;
      pending = detect({ ask })
        .then((r) => {
          if (r.status === 'found') found = r.country;
          return found;
        })
        .catch(() => null)
        .finally(() => {
          pending = null;
        });
      return pending;
    },
    reset() {
      found = null;
    },
  };
}

export const viewerCountry = makeViewerCountry();

/** Request headers for a listings call: the country header only when it is known. */
export function countryHeaders(country: string | null): Record<string, string> {
  return country && /^[A-Z]{2}$/.test(country) ? { 'X-Device-Country': country } : {};
}
