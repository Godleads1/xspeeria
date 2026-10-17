import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { AccountDetailsScreen } from '../../src/features/profile/AccountDetailsScreen';

export default function AccountDetailsRoute(): ReactElement {
  const router = useRouter();
  return <AccountDetailsScreen onBack={() => router.back()} />;
}
