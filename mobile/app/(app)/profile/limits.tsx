import type { ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { MyLimitsScreen } from '../../../src/features/profile/MyLimitsScreen';
import { serverLimits } from '../../../src/features/profile/serverLimits';
import { useThemeMode } from '../../../src/theme';

/** Profile › KYC and limits, server builds (ADR-058). The demo keeps its tier cards. */
export default function LimitsRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  if (!SERVER_MODE) return <Redirect href="/profile/kyc" />;
  return <MyLimitsScreen source={serverLimits} onBack={() => router.back()} onVerifyIdentity={() => router.push('/profile/kyc')} onUpgrade={() => router.push('/profile/upgrade')} />;
}
