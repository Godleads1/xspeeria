import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { IdentityCheckScreen } from '../../../src/features/kyc/IdentityCheckScreen';
import { serverKyc } from '../../../src/features/kyc/serverKyc';
import { KycLimitsScreen } from '../../../src/features/profile/KycLimitsScreen';
import { useThemeMode } from '../../../src/theme';

/** Profile › KYC. Server builds: the Didit identity check (ADR-040). Demo: tiers (ADR-007). */
export default function KycRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  if (SERVER_MODE) {
    return (
      <IdentityCheckScreen
        source={serverKyc}
        onBack={() => router.back()}
        onVerified={() => router.replace('/marketplace')}
      />
    );
  }
  return <KycLimitsScreen onBack={() => router.back()} />;
}
