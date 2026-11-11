/**
 * ADR-111: the currency you pay with, for screens outside the Market (Search). Detected from
 * your approved identity checks and the country the phone is in (`payChoiceFrom`), asked
 * each time the screen opens (so a newly approved check or another account counts at once);
 * null until loaded, in demo builds, or before any check is approved. Only a display
 * choice — the server checks the country again on every offer and take.
 */

import { useEffect, useState } from 'react';

import { SERVER_MODE } from '../../api/config';
import { marketServer, payCurrencyOf, type MarketServer } from './serverOffers';

export function usePayCurrency(source: Pick<MarketServer, 'payChoice'> = marketServer): string | null {
  const [pay, setPay] = useState<string | null>(null);
  useEffect(() => {
    if (!SERVER_MODE || !source.payChoice) return undefined;
    let on = true;
    source.payChoice().then(
      (c) => on && setPay(payCurrencyOf(c, null)),
      () => undefined, // not known: the naira search, and the server still checks everything
    );
    return () => {
      on = false;
    };
  }, [source]);
  return pay;
}
