import type { ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { PROFILE_USER } from '../../../src/features/profile/data';
import { SupportChatScreen } from '../../../src/features/support/SupportChatScreen';
import { useThemeMode } from '../../../src/theme';

/** Server builds: Support runs through Disputes & support (ADR-050/057). Demo: the chat mock. */
export default function SupportRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  if (SERVER_MODE) return <Redirect href="/market/disputes" />;
  return <SupportChatScreen firstName={PROFILE_USER.fullName.split(' ')[0]} onBack={() => router.back()} />;
}
