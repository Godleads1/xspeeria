/**
 * Session for the demo app (ADR-013). In memory: reloading the app signs you out.
 * Log-in checks identifier + PIN against the demo account; 5 wrong tries lock log-in for
 * 15 minutes (same rule as ADR-008). Errors never say which part was wrong, so the screen
 * cannot be used to find out whether an account exists. "Remember me" keeps only the
 * phone/email on the device, never the PIN. Biometric log-in is allowed only on a device
 * where it was turned on after a PIN log-in or sign-up.
 */

import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { normaliseEmail, normalisePhone } from '../profile/verification';
import { DEMO_ACCOUNT } from './demo';
import { sameSecret } from './pin';

export const MAX_PIN_TRIES = 5;
export const PIN_LOCK_MS = 15 * 60 * 1000;
const REMEMBER_KEY = 'xspeeria.rememberedLogin';
const BIOMETRIC_KEY = 'xspeeria.biometricLogin';

interface Account {
  readonly phone: string;
  readonly email: string;
  readonly pin: string;
}

interface State {
  readonly signedIn: boolean;
  readonly account: Account;
  readonly failed: number;
  readonly lockedUntil: number;
  readonly biometric: boolean;
  readonly remembered: string | null;
  /**
   * Region detected at log-in that the user has no KYC for (ADR-016). Server-side this comes
   * from IP / device signals; the demo sets it with "log in as if from the United States".
   */
  readonly newRegion: 'US' | null;
}

const INITIAL: State = {
  signedIn: false,
  account: { ...DEMO_ACCOUNT },
  failed: 0,
  lockedUntil: 0,
  biometric: false,
  remembered: null,
  newRegion: null,
};

let state: State = INITIAL;
const listeners = new Set<() => void>();

function set(next: Partial<State>): void {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: 'locked'; until: number }
  | { ok: false; reason: 'wrong'; triesLeft: number }
  | { ok: false; reason: 'invalid' };

export const session = {
  get: (): State => state,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  /** `identifier` is a phone (with country code) or an email. */
  logIn(identifier: string, pin: string, now: number, remember: boolean): LoginResult {
    if (now < state.lockedUntil) return { ok: false, reason: 'locked', until: state.lockedUntil };
    const asPhone = normalisePhone(identifier);
    const asEmail = normaliseEmail(identifier);
    if (!asPhone && !asEmail) return { ok: false, reason: 'invalid' };
    const who = asPhone ? sameSecret(asPhone, state.account.phone) : sameSecret(asEmail ?? '', state.account.email);
    const pinOk = sameSecret(pin, state.account.pin);
    if (who && pinOk) {
      set({ signedIn: true, failed: 0, lockedUntil: 0 });
      const keep = remember ? (asPhone ?? asEmail) : null;
      set({ remembered: keep });
      (keep ? AsyncStorage.setItem(REMEMBER_KEY, keep) : AsyncStorage.removeItem(REMEMBER_KEY)).catch(() => undefined);
      return { ok: true };
    }
    const failed = state.failed + 1;
    if (failed >= MAX_PIN_TRIES) {
      const until = now + PIN_LOCK_MS;
      set({ failed: 0, lockedUntil: until });
      return { ok: false, reason: 'locked', until };
    }
    set({ failed });
    return { ok: false, reason: 'wrong', triesLeft: MAX_PIN_TRIES - failed };
  },

  /** Biometric log-in: allowed only where it was turned on, and never while locked. */
  logInWithBiometrics(now: number): boolean {
    if (!state.biometric || now < state.lockedUntil) return false;
    set({ signedIn: true, failed: 0 });
    return true;
  },

  /** Sign-up finished: the new (demo) account takes the chosen contact details and PIN. */
  completeSignUp(account: Account): void {
    set({ account, signedIn: true, failed: 0, lockedUntil: 0 });
  },

  setBiometric(on: boolean): void {
    set({ biometric: on });
    (on ? AsyncStorage.setItem(BIOMETRIC_KEY, '1') : AsyncStorage.removeItem(BIOMETRIC_KEY)).catch(() => undefined);
  },

  /** Demo only: the next log-in behaves as if it came from this region. */
  simulateRegion(region: 'US' | null): void {
    set({ newRegion: region });
  },

  clearNewRegion(): void {
    set({ newRegion: null });
  },

  logOut(): void {
    set({ signedIn: false });
  },

  async restore(): Promise<void> {
    try {
      const [remembered, bio] = await Promise.all([AsyncStorage.getItem(REMEMBER_KEY), AsyncStorage.getItem(BIOMETRIC_KEY)]);
      set({ remembered, biometric: bio === '1' });
    } catch {
      /* Storage unavailable: start clean. */
    }
  },

  /** Tests only. */
  reset(): void {
    state = INITIAL;
    for (const l of listeners) l();
  },
};

export function useSession(): State {
  return useSyncExternalStore(session.subscribe, session.get, session.get);
}
