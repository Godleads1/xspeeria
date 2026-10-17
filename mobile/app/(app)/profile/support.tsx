import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { PROFILE_USER } from '../../../src/features/profile/data';
import { SupportChatScreen } from '../../../src/features/support/SupportChatScreen';
import { useThemeMode } from '../../../src/theme';

export default function SupportRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return <SupportChatScreen firstName={PROFILE_USER.fullName.split(' ')[0]} onBack={() => router.back()} />;
}
