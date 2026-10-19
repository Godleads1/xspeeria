/**
 * Suggests a new country's identity check once per sign-in (ADR-042 rule 4). The server says
 * which country it sees the user in; the user confirms or skips. Skipping is remembered only
 * in memory, for this session — nothing about location is stored on the phone.
 */

import { useEffect, useRef } from 'react';

import type { KycCountry, ServerRegions } from '../../api/kycApi';
import { session } from '../auth/session';

let asked = new Set<KycCountry>();

export const regionPrompt = {
  skip(country: KycCountry): void {
    asked.add(country);
  },
  reset(): void {
    asked = new Set();
  },
  /** The country to suggest now, or null; marks it asked so it is offered once. */
  next(r: ServerRegions): KycCountry | null {
    const c = r.suggested_country;
    if (!c || asked.has(c)) return null;
    asked.add(c);
    return c;
  },
};

// A different user signs in: ask again.
session.onUserChange(() => regionPrompt.reset());

/** Asks the server once after sign-in and opens the prompt when it suggests a country. */
export function useRegionPrompt(
  load: (() => Promise<ServerRegions>) | null,
  open: (country: KycCountry) => void,
): void {
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (!load) return;
    let live = true;
    load().then(
      (r) => {
        const c = regionPrompt.next(r);
        if (live && c) openRef.current(c);
      },
      () => undefined, // offline: ask next time
    );
    return () => {
      live = false;
    };
  }, [load]);
}
