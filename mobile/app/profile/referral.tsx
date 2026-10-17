import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { ReferralScreen } from '../../src/features/referral/ReferralScreen';

export default function ReferralRoute(): ReactElement {
  const router = useRouter();
  return <ReferralScreen onBack={() => router.back()} />;
}
