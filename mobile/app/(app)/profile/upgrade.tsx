import type { ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { serverUpgrade } from '../../../src/features/profile/serverUpgrade';
import { UpgradeTierScreen } from '../../../src/features/profile/UpgradeTierScreen';
import { useThemeMode } from '../../../src/theme';

/** Raise your limits: Tier 2 and Tier 3 checks (ADR-058). Server builds only. */
export default function UpgradeRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  if (!SERVER_MODE) return <Redirect href="/profile/kyc" />;
  return <UpgradeTierScreen source={serverUpgrade} onBack={() => router.back()} />;
}
