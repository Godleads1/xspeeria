import type { ReactElement } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { AddPayoutAccountScreen } from '../../../src/features/payouts/AddPayoutAccountScreen';
import { serverPayouts } from '../../../src/features/payouts/serverPayouts';
import { marketServer } from '../../../src/features/market/serverOffers';
import { useThemeMode } from '../../../src/theme';

/** ADR-105: the currencies the server offers now (China appears only when it's switched on). */
const offered = async (): Promise<readonly string[]> => Object.keys((await marketServer.ceilings?.()) ?? {});

/** Add a payout account (ADR-036). Server builds only; the currency param is untrusted. */
export default function AddPayoutAccountRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const { currency } = useLocalSearchParams<{ currency?: string }>();
  if (!SERVER_MODE) return <Redirect href="/profile/beneficiaries" />;
  return (
    <AddPayoutAccountScreen
      source={serverPayouts}
      initialCurrency={typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? currency : 'NGN'}
      onBack={() => router.back()}
      onAdded={() => router.back()}
      offered={offered}
    />
  );
}
