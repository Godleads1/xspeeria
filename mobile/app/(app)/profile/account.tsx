import { useEffect, useState, type ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { serverAuth } from '../../../src/features/auth/serverAuth';
import { regionsFromServer } from '../../../src/features/kyc/regions';
import { serverRegions } from '../../../src/features/kyc/serverKyc';
import { AccountDetailsScreen } from '../../../src/features/profile/AccountDetailsScreen';
import type { KycRegion } from '../../../src/features/profile/data';
import { useThemeMode } from '../../../src/theme';

export default function AccountDetailsRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const [regions, setRegions] = useState<KycRegion[] | null>(null);
  useEffect(() => {
    if (!SERVER_MODE) return;
    void serverAuth.refreshProfile().catch(() => undefined); // ADR-055: identity from the ID
    serverRegions().then(
      (r) => setRegions(regionsFromServer(r)),
      () => setRegions([]),
    );
  }, []);
  return (
    <AccountDetailsScreen
      onBack={() => router.back()}
      onEdit={() => router.push('/profile/edit')}
      serverRegions={SERVER_MODE ? regions : undefined}
      onVerifyAnotherCountry={SERVER_MODE ? () => router.push('/profile/verify-country') : undefined}
    />
  );
}
