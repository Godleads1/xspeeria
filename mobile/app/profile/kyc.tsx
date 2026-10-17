import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { KycLimitsScreen } from '../../src/features/profile/KycLimitsScreen';

export default function KycRoute(): ReactElement {
  const router = useRouter();
  return <KycLimitsScreen onBack={() => router.back()} />;
}
