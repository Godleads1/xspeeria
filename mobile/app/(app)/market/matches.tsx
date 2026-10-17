import { useEffect, type ReactElement } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { SelectMatchScreen } from '../../../src/features/market/SelectMatchScreen';
import { BUYABLE } from '../../../src/features/market/data';
import type { TradeRequest } from '../../../src/features/market/MarketScreen';
import { useThemeMode } from '../../../src/theme';

/**
 * Route params are untrusted input (deep links can set them), so they are re-validated
 * here; anything malformed returns the user to Market instead of rendering bad numbers.
 */
function parseParams(params: Record<string, string | string[] | undefined>): TradeRequest | null {
  const one = (k: string): string | undefined => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const side = one('side');
  const currency = one('currency');
  const amount = Number(one('amount'));
  const rate = Number(one('rate'));
  if (side !== 'buy' && side !== 'sell') return null;
  const valid =
    BUYABLE.some((c) => c.code === currency) &&
    Number.isSafeInteger(amount) &&
    amount > 0 &&
    Number.isSafeInteger(rate) &&
    rate > 0;
  return valid
    ? { side, currency: currency as string, amountMinor: amount, rateHundredths: rate }
    : null;
}

export default function SelectMatchRoute(): ReactElement | null {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const request = parseParams(useLocalSearchParams());

  useEffect(() => {
    if (!request) router.back();
  }, [request, router]);

  if (!request) return null;

  return (
    <SelectMatchScreen
      request={request}
      onBack={() => router.back()}
      onCancel={() => router.back()}
      onTakeListing={(_listing, side) =>
        Alert.alert(
          side === 'buy' ? 'Buy this offer' : 'Fill this request',
          'Confirming a trade is the next screen to be built. Nothing has been sent.',
        )
      }
    />
  );
}
