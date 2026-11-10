/**
 * The currencies the server offers now: those with a rate limit in force (ADR-102). A
 * currency switched off on the server (China until legal clearance, ADR-105) has none, so
 * the app hides it. Loaded once per app session; null until loaded or in demo builds.
 */

import { useEffect, useState } from 'react';

import { SERVER_MODE } from '../../api/config';
import { marketServer } from './serverOffers';

let loaded: Promise<ReadonlySet<string>> | null = null;

function load(): Promise<ReadonlySet<string>> {
  loaded ??= (marketServer.ceilings?.() ?? Promise.resolve({})).then(
    (c) => new Set(Object.keys(c)),
    (e: unknown) => {
      loaded = null; // try again next time
      throw e;
    },
  );
  return loaded;
}

/** Forget the list (e.g. at log-out). */
export function resetOfferedCurrencies(): void {
  loaded = null;
}

export function useOfferedCurrencies(): ReadonlySet<string> | null {
  const [offered, setOffered] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (!SERVER_MODE) return undefined;
    let on = true;
    load().then(
      (s) => on && setOffered(s),
      () => undefined, // not loaded: the built-in list stands
    );
    return () => {
      on = false;
    };
  }, []);
  return offered;
}
