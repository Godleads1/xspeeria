import type { ReactElement } from 'react';
import { Stack } from 'expo-router';

import { color, useThemeMode } from '../../src/theme';

export const unstable_settings = { initialRouteName: 'welcome' };

/** Signed-out screens: welcome, log in, forgot PIN, sign-up (ADR-013). */
export default function AuthLayout(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg.canvas } }} />;
}
