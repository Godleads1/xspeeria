/**
 * Applies the idle lock and maximum session (ADR-024) while the user is inside the app:
 * checks every 15 seconds and whenever the app returns to the foreground, so a phone left
 * in a pocket for 5 minutes asks for the PIN or biometrics when opened again.
 * Touches are reported with `onTouchStart` on the signed-in layout (`session.touch`).
 */

import { useEffect } from 'react';
import { AppState } from 'react-native';

import { session } from './session';

const CHECK_EVERY_MS = 15_000;

export function useIdleLock(now: () => number = Date.now): void {
  useEffect(() => {
    const check = (): void => {
      session.enforceTimeouts(now());
    };
    const timer = setInterval(check, CHECK_EVERY_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') check();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [now]);
}
