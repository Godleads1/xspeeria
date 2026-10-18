/**
 * Session for the demo app (ADR-013, ADR-018). In memory: reloading the app signs you out.
 * Log-in checks identifier + PIN against the demo account; 5 wrong tries lock log-in for
 * 15 minutes (same rule as ADR-008). Errors never say which part was wrong, so the screen
 * cannot be used to find out whether an account exists. "Remember me" keeps only the
 * phone/email on the device, never the PIN. Biometric log-in is allowed only on a device
 * where it was turned on after a PIN log-in or sign-up, and only for that account.
 *
 * Every demo path refuses outside a development build (DEMO_MODE, ADR-018).
 *
 * User-scoped stores register a reset with `onUserChange`. It runs on log-out and when a new
 * account is created, so nothing from one person's session is visible to the next.
 */

import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { normaliseEmail, normalisePhone } from '../profile/verification';
import { DEMO_ACCOUNT, DEMO_MODE } from './demo';
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
  /** Phone of the account biometric log-in was turned on for; null when off. */
  readonly biometricFor: string | null;
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
  biometricFor: null,
  remembered: null,
  newRegion: null,
};

let state: State = INITIAL;
const listeners = new Set<() => void>();
const userChangeHandlers = new Set<() => void>();

function set(next: Partial<State>): void {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

/** Clears every registered user-scoped store. A failing reset must not stop the others. */
function clearUserData(): void {
  for (const h of userChangeHandlers) {
    try {
      h();
    } catch {
      /* keep clearing the rest */
    }
  }
}

function storeBiometric(phone: string | null): void {
  (phone ? AsyncStorage.setItem(BIOMETRIC_KEY, phone) : AsyncStorage.removeItem(BIOMETRIC_KEY)).catch(() => undefined);
}

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: 'locked'; until: number }
  | { ok: false; reason: 'wrong'; triesLeft: number }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'unavailable' };

export const session = {
  get: (): State => state,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  /** True when biometric log-in is on for the current account. */
  biometricOn: (): boolean => state.biometricFor !== null && state.biometricFor === state.account.phone,

  /** A user-scoped store registers its reset here (log-out, new account). */
  onUserChange(handler: () => void): () => void {
    userChangeHandlers.add(handler);
    return () => userChangeHandlers.delete(handler);
  },

  /** `identifier` is a phone (with country code) or an email. */
  logIn(identifier: string, pin: string, now: number, remember: boolean): LoginResult {
    if (!DEMO_MODE) return { ok: false, reason: 'unavailable' };
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

  /** Biometric log-in: only where it was turned on for this account, and never while locked. */
  logInWithBiometrics(now: number): boolean {
    if (!DEMO_MODE || !session.biometricOn() || now < state.lockedUntil) return false;
    set({ signedIn: true, failed: 0 });
    return true;
  },

  /**
   * Sign-up finished: earlier user data is cleared, then the new (demo) account takes the
   * chosen contact details and PIN. Biometric log-in is on only if chosen during this sign-up.
   */
  completeSignUp(account: Account, options: { biometric?: boolean } = {}): void {
    if (!DEMO_MODE) throw new Error('Sign-up is not available in this build');
    clearUserData();
    const biometricFor = options.biometric ? account.phone : null;
    set({ account, signedIn: true, failed: 0, lockedUntil: 0, biometricFor, newRegion: null });
    storeBiometric(biometricFor);
  },

  /** Phone or email changed after a confirmed code (ADR-011): log-in now uses the new one. */
  updateContact(change: { phone?: string; email?: string }): void {
    const phone = change.phone ?? state.account.phone;
    const email = change.email ?? state.account.email;
    const keepBiometric = state.biometricFor !== null && state.biometricFor === state.account.phone;
    const biometricFor = keepBiometric ? phone : state.biometricFor;
    set({ account: { ...state.account, phone, email }, biometricFor });
    if (keepBiometric) storeBiometric(phone);
  },

  setBiometric(on: boolean): void {
    const biometricFor = on ? state.account.phone : null;
    set({ biometricFor });
    storeBiometric(biometricFor);
  },

  /** Demo only: the next log-in behaves as if it came from this region. */
  simulateRegion(region: 'US' | null): void {
    set({ newRegion: region });
  },

  clearNewRegion(): void {
    set({ newRegion: null });
  },

  /** Signs out and clears the user's data from memory (ADR-018). */
  logOut(): void {
    set({ signedIn: false, newRegion: null });
    clearUserData();
  },

  async restore(): Promise<void> {
    try {
      const [remembered, bio] = await Promise.all([AsyncStorage.getItem(REMEMBER_KEY), AsyncStorage.getItem(BIOMETRIC_KEY)]);
      // Older builds stored '1'; that is not bound to an account, so it is dropped.
      const biometricFor = bio && bio !== '1' ? bio : null;
      if (bio === '1') AsyncStorage.removeItem(BIOMETRIC_KEY).catch(() => undefined);
      set({ remembered, biometricFor });
    } catch {
      /* Storage unavailable: start clean. */
    }
  },

  /** Tests only. Registered user-change handlers stay registered. */
  reset(): void {
    state = INITIAL;
    for (const l of listeners) l();
  },
};

export function useSession(): State {
  return useSyncExternalStore(session.subscribe, session.get, session.get);
}
