import { useCallback, useState, type ReactElement } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { PayoutAccountsScreen } from '../../../src/features/payouts/PayoutAccountsScreen';
import { serverPayouts } from '../../../src/features/payouts/serverPayouts';
import { BeneficiariesScreen } from '../../../src/features/profile/BeneficiariesScreen';
import { requestStepUp } from '../../../src/features/security/stepUp';
import { useThemeMode } from '../../../src/theme';

/** Demo: the on-device beneficiaries. Server builds: real payout accounts (ADR-036). */
export default function BeneficiariesRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const [refresh, setRefresh] = useState(0);
  useFocusEffect(useCallback(() => setRefresh((n) => n + 1), []));
  if (SERVER_MODE) {
    return (
      <PayoutAccountsScreen
        source={serverPayouts}
        refreshSignal={refresh}
        onBack={() => router.back()}
        onAdd={() => router.push('/profile/add-payout-account')}
      />
    );
  }
  return (
    <BeneficiariesScreen
      onBack={() => router.back()}
      onAdd={() => router.push('/profile/add-beneficiary')}
      stepUp={requestStepUp}
    />
  );
}
