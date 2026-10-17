import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { ChangePasswordScreen } from '../../src/features/profile/ChangePasswordScreen';

export default function ChangePasswordRoute(): ReactElement {
  const router = useRouter();
  return <ChangePasswordScreen onBack={() => router.back()} />;
}
