import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { SecurityScreen } from '../../src/features/profile/SecurityScreen';

export default function SecurityRoute(): ReactElement {
  const router = useRouter();
  return <SecurityScreen onBack={() => router.back()} />;
}
