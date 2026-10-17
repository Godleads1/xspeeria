/**
 * 2FA state for the mock app (ADR-008). In memory only; lost on reload.
 *
 * Mirrors the server rules so the flows can be exercised: TOTP ±1 step, 5 wrong codes →
 * 15-minute lock, 10 single-use recovery codes, 2FA cannot be switched off. In production
 * every one of these is enforced server-side and the device never keeps the secret.
 */

import { useSyncExternalStore } from 'react';

import { base32Encode, verifyTotp, base32Decode } from './totp';

export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const RECOVERY_CODE_COUNT = 10;
/** No 0/O/1/I/L/U to avoid misreading. 30 symbols. */
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export type RandomBytes = (n: number) => Uint8Array;

interface State {
  readonly authenticatorSecret: string | null;
  readonly pendingSecret: string | null;
  readonly recoveryCodes: readonly string[];
  readonly failedAttempts: number;
  readonly lockedUntil: number;
}

const INITIAL: State = {
  authenticatorSecret: null,
  pendingSecret: null,
  recoveryCodes: [],
  failedAttempts: 0,
  lockedUntil: 0,
};

let state: State = INITIAL;
const listeners = new Set<() => void>();

function set(next: Partial<State>): void {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

/** Uniform pick from the alphabet using rejection sampling (no modulo bias). */
function randomRecoveryCode(random: RandomBytes): string {
  const limit = 256 - (256 % RECOVERY_ALPHABET.length);
  let out = '';
  while (out.length < 8) {
    for (const b of random(16)) {
      if (b < limit && out.length < 8) out += RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length];
    }
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export type VerifyResult =
  | { ok: true; usedRecoveryCode: boolean }
  | { ok: false; reason: 'not-enrolled' | 'locked' | 'wrong'; attemptsLeft: number; lockedUntil: number };

export const twoFactor = {
  get: (): State => state,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  isEnrolled: (): boolean => state.authenticatorSecret !== null,

  /** Starts authenticator enrolment with a fresh 160-bit secret. */
  beginEnrolment(random: RandomBytes): string {
    const secret = base32Encode(random(20));
    set({ pendingSecret: secret });
    return secret;
  },

  /** Confirms enrolment with a code from the app; returns new recovery codes on success. */
  confirmEnrolment(code: string, nowMs: number, random: RandomBytes): readonly string[] | null {
    const pending = state.pendingSecret;
    if (!pending || !verifyTotp(base32Decode(pending), code, nowMs)) return null;
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => randomRecoveryCode(random));
    set({ authenticatorSecret: pending, pendingSecret: null, recoveryCodes: codes, failedAttempts: 0, lockedUntil: 0 });
    return codes;
  },

  cancelEnrolment(): void {
    set({ pendingSecret: null });
  },

  /** Step-up check: a 6-digit code or an unused recovery code (consumed on use). */
  verify(input: string, nowMs: number): VerifyResult {
    if (!state.authenticatorSecret) return { ok: false, reason: 'not-enrolled', attemptsLeft: 0, lockedUntil: 0 };
    if (nowMs < state.lockedUntil) {
      return { ok: false, reason: 'locked', attemptsLeft: 0, lockedUntil: state.lockedUntil };
    }
    const code = input.trim().toUpperCase();
    if (verifyTotp(base32Decode(state.authenticatorSecret), code, nowMs)) {
      set({ failedAttempts: 0, lockedUntil: 0 });
      return { ok: true, usedRecoveryCode: false };
    }
    const normalised = code.replace(/[^0-9A-Z]/g, '');
    const recovery = normalised.length === 8 ? `${normalised.slice(0, 4)}-${normalised.slice(4)}` : '';
    if (recovery && state.recoveryCodes.includes(recovery)) {
      set({ recoveryCodes: state.recoveryCodes.filter((c) => c !== recovery), failedAttempts: 0, lockedUntil: 0 });
      return { ok: true, usedRecoveryCode: true };
    }
    const failed = state.failedAttempts + 1;
    if (failed >= MAX_ATTEMPTS) {
      const until = nowMs + LOCK_MS;
      set({ failedAttempts: 0, lockedUntil: until });
      return { ok: false, reason: 'locked', attemptsLeft: 0, lockedUntil: until };
    }
    set({ failedAttempts: failed });
    return { ok: false, reason: 'wrong', attemptsLeft: MAX_ATTEMPTS - failed, lockedUntil: 0 };
  },

  /** Replaces recovery codes. Callers must pass a step-up check first. */
  regenerateRecoveryCodes(random: RandomBytes): readonly string[] {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => randomRecoveryCode(random));
    set({ recoveryCodes: codes });
    return codes;
  },

  /** Tests only. */
  reset(): void {
    state = INITIAL;
    for (const l of listeners) l();
  },
};

export function useTwoFactor(): State {
  return useSyncExternalStore(twoFactor.subscribe, twoFactor.get, twoFactor.get);
}
