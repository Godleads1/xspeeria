import { useEffect, type ReactElement } from 'react';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { SATOSHI_FILES, SPACE_GROTESK_FILES } from '../src/theme';

// Keep the native splash up until the brand font is ready, so text never flashes in the
// system face first.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* Already hidden (e.g. fast refresh) — nothing to do. */
});

export default function RootLayout(): ReactElement | null {
  const [loaded, error] = useFonts({ ...SATOSHI_FILES, ...SPACE_GROTESK_FILES });
  // A font failure must not block the app: it falls back to the system face.
  const ready = loaded || error !== null;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {
        /* Splash already hidden. */
      });
    }
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
