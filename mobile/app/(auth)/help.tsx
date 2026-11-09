import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { helpApi } from '../../src/api/helpApi';
import { helpKey } from '../../src/features/help/helpKey';
import { NeedHelpScreen } from '../../src/features/help/NeedHelpScreen';
import { useThemeMode } from '../../src/theme';

/** "Need help?" from the log-in screen (ADR-103). Shown only in server builds. */
export default function HelpRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return <NeedHelpScreen source={helpApi} store={helpKey} onBack={() => router.back()} />;
}
