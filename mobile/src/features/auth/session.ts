/**
 * Session for the demo app (ADR-013, ADR-018). In memory: reloading the app signs you out.
 * Log-in checks identifier + PIN against the demo account; 5 wrong tries lock log-in for
 * 15 minutes (same rule as ADR-008). Errors never say which part was wrong, so the screen
 * cannot be used to find out whether an account exists. "Remember me" keeps only the
 * phone/email on the device, never the PIN. Biometric log-in is allowed only on a device
 * where it was turned on after a PIN log-in or sign-up, and only for that account.
 *
 * Idle lock and maximum session (product owner, 2026-10-18, ADR-024): after 5 minutes
 * without use the app asks for the PIN or biometrics again, and 7 days after a PIN log-in a
 * full log-in is needed. An idle lock keeps the user's data (same person); log-out clears it.
 * The server must enforce both; the device only mirrors them.
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
/** ADR-024: 5 minutes without use → unlock again. */
export const IDLE_LOCK_MS = 5 * 60 * 1000;
/** ADR-024: 7 days after a full PIN log-in → full log-in again (biometric unlock does not extend it). */
export const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const REMEMBER_KEY = 'xspeeria.rememberedLogin';
const BIOMETRIC_KEY = 'xspeeria.biometricLogin';
/** Time of the last PIN log-in (not a secret), so the 7-day limit survives an app restart. */
const PIN_LOGIN_AT_KEY = 'xspeeria.pinLoginAt';

function storePinLoginAt(at: number): void {
  (at > 0 ? AsyncStorage.setItem(PIN_LOGIN_AT_KEY, String(at)) : AsyncStorage.removeItem(PIN_LOGIN_AT_KEY)).catch(
    () => undefined,
  );
}

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
  /** When the last full (PIN) log-in or sign-up happened; 0 when signed out. */
  readonly signedInAt: number;
  /** Why the session last ended on its own, shown on the log-in screen. */
  readonly endedBy: 'idle' | 'expired' | null;
}

const INITIAL: State = {
  signedIn: false,
  account: { ...DEMO_ACCOUNT },
  failed: 0,
  lockedUntil: 0,
  biometricFor: null,
  remembered: null,
  newRegion: null,
  signedInAt: 0,
  endedBy: null,
};

/** Last user activity. Kept outside `state` so touches do not re-render subscribers. */
let lastActiveAt = 0;

let state: State = INITIAL;
const signOutHandlers = new Set<() => void>();
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
      lastActiveAt = now;
      set({ signedIn: true, failed: 0, lockedUntil: 0, signedInAt: now, endedBy: null });
      storePinLoginAt(now);
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
    // Biometrics unlock a session started with the PIN (also after an app restart); after a
    // log-out, or once the 7-day maximum has passed, only the PIN does.
    if (state.signedInAt === 0 || now - state.signedInAt >= SESSION_MAX_MS) return false;
    lastActiveAt = now;
    set({ signedIn: true, failed: 0, endedBy: null });
    return true;
  },

  /**
   * Sign-up finished: earlier user data is cleared, then the new (demo) account takes the
   * chosen contact details and PIN. Biometric log-in is on only if chosen during this sign-up.
   */
  completeSignUp(account: Account, options: { biometric?: boolean } = {}, now: number = Date.now()): void {
    if (!DEMO_MODE) throw new Error('Sign-up is not available in this build');
    clearUserData();
    const biometricFor = options.biometric ? account.phone : null;
    lastActiveAt = now;
    set({ account, signedIn: true, failed: 0, lockedUntil: 0, biometricFor, newRegion: null, signedInAt: now, endedBy: null });
    storePinLoginAt(now);
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

  /** Records user activity (a touch). Cheap: no re-render. */
  touch(now: number): void {
    if (state.signedIn) lastActiveAt = now;
  },

  /**
   * Ends the session when it has been idle 5 minutes (keeps the user's data, so the same
   * person can unlock) or is 7 days past its PIN log-in (full log-in needed). Returns why.
   */
  enforceTimeouts(now: number): 'idle' | 'expired' | null {
    if (!state.signedIn) return null;
    if (now - state.signedInAt >= SESSION_MAX_MS) {
      // A full log-out: the user's data is cleared, as on "Log out".
      set({ signedIn: false, newRegion: null, signedInAt: 0, endedBy: 'expired' });
      storePinLoginAt(0);
      clearUserData();
      for (const h of signOutHandlers) h();
      return 'expired';
    }
    if (now - lastActiveAt >= IDLE_LOCK_MS) {
      set({ signedIn: false, endedBy: 'idle' });
      // The server's own 5-minute idle limit has ended its session too (ADR-024).
      for (const h of signOutHandlers) h();
      return 'idle';
    }
    return null;
  },

  /** Demo only: the next log-in behaves as if it came from this region. */
  simulateRegion(region: 'US' | null): void {
    set({ newRegion: region });
  },

  clearNewRegion(): void {
    set({ newRegion: null });
  },

  /**
   * A real server accepted the log-in or sign-up (ADR-027). The server owns the session;
   * this mirrors it so the screens and the idle lock work as before. No PIN is kept.
   */
  serverSignIn(account: { phone: string; email: string }, now: number, options: { newAccount?: boolean } = {}): void {
    if (options.newAccount || account.phone !== state.account.phone) clearUserData();
    lastActiveAt = now;
    set({
      account: { phone: account.phone, email: account.email, pin: '' },
      signedIn: true,
      failed: 0,
      lockedUntil: 0,
      signedInAt: now,
      endedBy: null,
      newRegion: null,
    });
  },

  /** The server ended the session (refresh refused): same as reaching the 7-day limit. */
  serverEnded(): void {
    if (!state.signedIn) return;
    set({ signedIn: false, signedInAt: 0, endedBy: 'expired' });
    for (const h of signOutHandlers) h();
  },

  /** Remember (or forget) the phone/email on this device. Never the PIN. */
  setRemembered(value: string | null): void {
    set({ remembered: value });
    (value ? AsyncStorage.setItem(REMEMBER_KEY, value) : AsyncStorage.removeItem(REMEMBER_KEY)).catch(() => undefined);
  },

  /** Runs on log-out and when the session ends (server mode drops its tokens here). */
  onSignOut(handler: () => void): () => void {
    signOutHandlers.add(handler);
    return () => signOutHandlers.delete(handler);
  },

  /** Signs out and clears the user's data from memory (ADR-018). */
  logOut(): void {
    set({ signedIn: false, newRegion: null, signedInAt: 0, endedBy: null });
    storePinLoginAt(0);
    clearUserData();
    for (const h of signOutHandlers) h();
  },

  async restore(): Promise<void> {
    try {
      const [remembered, bio, pinAt] = await Promise.all([
        AsyncStorage.getItem(REMEMBER_KEY),
        AsyncStorage.getItem(BIOMETRIC_KEY),
        AsyncStorage.getItem(PIN_LOGIN_AT_KEY),
      ]);
      // Only a plain positive whole number is accepted; anything else means "log in with PIN".
      const parsed = pinAt && /^\d{1,15}$/.test(pinAt) ? Number(pinAt) : 0;
      // Older builds stored '1'; that is not bound to an account, so it is dropped.
      const biometricFor = bio && bio !== '1' ? bio : null;
      if (bio === '1') AsyncStorage.removeItem(BIOMETRIC_KEY).catch(() => undefined);
      set({ remembered, biometricFor, signedInAt: parsed });
    } catch {
      /* Storage unavailable: start clean. */
    }
  },

  /** Tests only. Registered user-change handlers stay registered. */
  reset(): void {
    state = INITIAL;
    lastActiveAt = 0;
    for (const l of listeners) l();
  },
};

export function useSession(): State {
  return useSyncExternalStore(session.subscribe, session.get, session.get);
}
