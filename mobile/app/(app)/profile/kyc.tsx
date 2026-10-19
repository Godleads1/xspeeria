import type { ReactElement } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { isKycCountry } from '../../../src/api/kycApi';
import { SERVER_MODE } from '../../../src/api/config';
import { IdentityCheckScreen } from '../../../src/features/kyc/IdentityCheckScreen';
import { serverKycFor } from '../../../src/features/kyc/serverKyc';
import { KycLimitsScreen } from '../../../src/features/profile/KycLimitsScreen';
import { useThemeMode } from '../../../src/theme';

/**
 * Profile › KYC. Server builds: the Didit identity check (ADR-040), for one country (ADR-042;
 * `?country=GB|US`, anything else means Nigeria). Demo: tiers (ADR-007).
 */
export default function KycRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const { country: raw } = useLocalSearchParams<{ country?: string }>();
  const country = isKycCountry(raw) ? raw : 'NG';
  if (SERVER_MODE) {
    return (
      <IdentityCheckScreen
        key={country}
        country={country}
        source={serverKycFor(country)}
        onBack={() => router.back()}
        onVerified={() => router.replace('/marketplace')}
      />
    );
  }
  return <KycLimitsScreen onBack={() => router.back()} />;
}
