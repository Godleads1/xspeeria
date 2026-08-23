import type { ReactElement } from 'react';
import { PlaceholderScreen } from '../../src/features/shared/PlaceholderScreen';

export default function ProfileRoute(): ReactElement {
  return (
    <PlaceholderScreen
      testID="profile-screen"
      title="Profile"
      message="Account and security settings arrive in a later milestone"
      actionLabel="Back to home"
    />
  );
}
