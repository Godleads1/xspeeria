/**
 * Device-side security preferences (ADR-007 A5). In memory only for now (reset on reload);
 * persistence waits for Decision 2 (auth/session specifics). Screenshot blocking is a
 * convenience for the user's privacy, not a security control: the server never relies on it.
 */

import { useEffect, useSyncExternalStore } from 'react';
import * as ScreenCapture from 'expo-screen-capture';

import { session } from '../auth/session';

interface SecuritySettings {
  /** Figma default: on. */
  readonly allowScreenshots: boolean;
}

let state: SecuritySettings = { allowScreenshots: true };
const listeners = new Set<() => void>();

export const securitySettings = {
  get: (): SecuritySettings => state,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setAllowScreenshots(allow: boolean): void {
    state = { ...state, allowScreenshots: allow };
    for (const l of listeners) l();
  },
  /** Back to the initial state (log-out / new account, and tests). */
  reset(): void {
    state = { allowScreenshots: true };
    for (const l of listeners) l();
  },
};


// Cleared on log-out and when a new account is created (ADR-018).
session.onUserChange(() => securitySettings.reset());

export function useSecuritySettings(): SecuritySettings {
  return useSyncExternalStore(securitySettings.subscribe, securitySettings.get, securitySettings.get);
}

const CAPTURE_KEY = 'xspeeria-user-setting';

/** Mounted once at the root: applies the screenshot preference app-wide. */
export function useApplyScreenCapturePreference(): void {
  const { allowScreenshots } = useSecuritySettings();
  useEffect(() => {
    const action = allowScreenshots
      ? ScreenCapture.allowScreenCaptureAsync(CAPTURE_KEY)
      : ScreenCapture.preventScreenCaptureAsync(CAPTURE_KEY);
    action.catch(() => {
      /* Unsupported platform (e.g. web): the preference simply has no effect there. */
    });
  }, [allowScreenshots]);
}
