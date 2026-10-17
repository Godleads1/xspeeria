import { useEffect, useState, type ReactElement } from 'react';
import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { useApplyScreenCapturePreference } from '../src/features/profile/securitySettings';
import { StepUpHost } from '../src/features/security/StepUpHost';
import { SATOSHI_FILES, SPACE_GROTESK_FILES, color, loadSavedThemeMode, useThemeMode } from '../src/theme';

// Keep the native splash up until the brand font is ready, so text never flashes in the
// system face first.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* Already hidden (e.g. fast refresh) — nothing to do. */
});

export default function RootLayout(): ReactElement | null {
  const [loaded, error] = useFonts({ ...SATOSHI_FILES, ...SPACE_GROTESK_FILES });
  // A font failure must not block the app: it falls back to the system face.
  const fontsReady = loaded || error !== null;
  // Restore the saved light/dark choice before the splash hides, so nothing flashes.
  const [modeReady, setModeReady] = useState(false);
  useEffect(() => {
    loadSavedThemeMode().finally(() => setModeReady(true));
  }, []);
  const ready = fontsReady && modeReady;
  const mode = useThemeMode();
  useApplyScreenCapturePreference();

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
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg.canvas } }} />
      {/* ADR-008: the single "Confirm it's you" sheet for step-up checks. */}
      <StepUpHost onSetUp={() => router.push('/profile/two-factor')} />
    </>
  );
}
