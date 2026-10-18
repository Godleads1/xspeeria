import { useEffect, useState, type ReactElement } from 'react';
import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { useApplyScreenCapturePreference } from '../src/features/profile/securitySettings';
import { StepUpHost } from '../src/features/security/StepUpHost';
import { DEMO_MODE } from '../src/features/auth/demo';
import { LaunchSplash } from '../src/features/auth/LaunchSplash';
import { UnavailableBuild } from '../src/features/auth/ui';
import { session, useSession } from '../src/features/auth/session';
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
    Promise.all([loadSavedThemeMode(), session.restore()]).finally(() => setModeReady(true));
  }, []);
  const ready = fontsReady && modeReady;
  const mode = useThemeMode();
  const { signedIn } = useSession();
  // Figma's first screen: the logo splash stays briefly after the native one hides.
  const [launching, setLaunching] = useState(true);
  useApplyScreenCapturePreference();

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {
        /* Splash already hidden. */
      });
    }
  }, [ready]);

  if (!ready) return null;
  // ADR-018: a release build has no demo services and no real ones yet, so nothing is reachable.
  if (!DEMO_MODE) return <UnavailableBuild />;

  return (
    <>
      <StatusBar style={mode === 'dark' && !launching ? 'light' : 'dark'} />
      {/* ADR-013: the app is reachable only when signed in; otherwise welcome / log in / sign-up. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg.canvas } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      {/* ADR-008: the single "Confirm it's you" sheet for step-up checks. */}
      {signedIn ? <StepUpHost onSetUp={() => router.push('/profile/two-factor')} /> : null}
      {launching ? <LaunchSplash onDone={() => setLaunching(false)} /> : null}
    </>
  );
}
