/**
 * Blocks screenshots and screen recording while a screen with secrets is open (ADR-008,
 * review SEC-09). Same as expo-screen-capture's hook, but never throws: on the web (where
 * the native module does not exist) or if the OS call fails, the screen still works. It is
 * a privacy aid for the user, not a security control the server relies on.
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

export function useBlockScreenCapture(key: string): void {
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    ScreenCapture.preventScreenCaptureAsync(key).catch(() => undefined);
    return () => {
      ScreenCapture.allowScreenCaptureAsync(key).catch(() => undefined);
    };
  }, [key]);
}
