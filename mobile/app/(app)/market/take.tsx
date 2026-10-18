import type { ReactElement } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { TakeOfferScreen } from '../../../src/features/market/TakeOfferScreen';
import { takeServer } from '../../../src/features/market/serverOffers';
import { useThemeMode } from '../../../src/theme';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Take offer (ADR-032). Server builds only; the offer id param is untrusted and re-read. */
export default function TakeRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const { offer } = useLocalSearchParams<{ offer?: string }>();
  if (!SERVER_MODE || typeof offer !== 'string' || !UUID.test(offer)) return <Redirect href="/marketplace" />;
  return (
    <TakeOfferScreen
      offerId={offer}
      source={takeServer}
      onBack={() => router.back()}
      onDone={() => router.back()} // back to the Market tab, which re-reads the offers
    />
  );
}
