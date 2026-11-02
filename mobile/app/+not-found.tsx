import type { ReactElement } from 'react';
import { Redirect } from 'expo-router';

import { useSession } from '../src/features/auth/session';
import { useThemeMode } from '../src/theme';

/**
 * Any address with no screen goes to the right start screen instead of "Unmatched Route".
 *
 * Expo Router 58 (SDK 58) sends a signed-out app to the `(auth)` group's own address, which
 * has no screen of its own, rather than to the group's first screen. Signed out: the Welcome
 * screen (ADR-013). Signed in: Home.
 */
export default function NotFound(): ReactElement {
  useThemeMode(); // every route follows light/dark mode (ADR-010); this one only redirects
  const { signedIn } = useSession();
  return <Redirect href={signedIn ? '/' : '/welcome'} />;
}
