import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { PlaceholderScreen } from '../../src/features/shared/PlaceholderScreen';

export default function ProfileRoute(): ReactElement {
  const router = useRouter();
  return (
    <PlaceholderScreen
      testID="profile-screen"
      title="Profile"
      message="Account and security settings arrive in a later milestone"
      actionLabel="Back to home"
      onAction={() => router.push('/')}
    />
  );
}
