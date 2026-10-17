import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { PROFILE_USER } from '../../src/features/profile/data';
import { SupportChatScreen } from '../../src/features/support/SupportChatScreen';

export default function SupportRoute(): ReactElement {
  const router = useRouter();
  return <SupportChatScreen firstName={PROFILE_USER.fullName.split(' ')[0]} onBack={() => router.back()} />;
}
