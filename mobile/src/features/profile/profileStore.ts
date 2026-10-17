/**
 * The signed-in user's editable profile (ADR-011). MOCK, in memory: the server is the source
 * of truth and must re-verify every change. Phone and email change only after a code sent to
 * the NEW address is confirmed; date of birth changes only after an ID check (pending until
 * then). Photos are local file URIs, re-encoded to strip metadata before use.
 */

import { useSyncExternalStore } from 'react';

import { session } from '../auth/session';
import { PROFILE_USER, type ProfileUser } from './data';

export interface PendingDob {
  readonly dateOfBirth: string;
  readonly submittedAt: number;
}

export interface Profile extends ProfileUser {
  readonly avatarUri: string | null;
  readonly bannerUri: string | null;
  readonly pendingDob: PendingDob | null;
}

const INITIAL: Profile = { ...PROFILE_USER, avatarUri: null, bannerUri: null, pendingDob: null };

let state: Profile = INITIAL;
const listeners = new Set<() => void>();

function set(next: Partial<Profile>): void {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export const profileStore = {
  get: (): Profile => state,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setAvatar: (uri: string | null): void => set({ avatarUri: uri }),
  setBanner: (uri: string | null): void => set({ bannerUri: uri }),
  /** Only call after the code sent to `phone` was confirmed (verification.ts). Log-in follows. */
  confirmPhone(phone: string): void {
    set({ phone });
    session.updateContact({ phone });
  },
  /** Only call after the code sent to `email` was confirmed (verification.ts). Log-in follows. */
  confirmEmail(email: string): void {
    set({ email });
    session.updateContact({ email });
  },
  /** Date of birth stays unchanged until the ID check approves it. */
  submitDob: (dateOfBirth: string, now: number): void => set({ pendingDob: { dateOfBirth, submittedAt: now } }),
  /** Back to the initial profile (log-out / new account, and tests). */
  reset(): void {
    state = INITIAL;
    for (const l of listeners) l();
  },
};


// Cleared on log-out and when a new account is created (ADR-018).
session.onUserChange(() => profileStore.reset());

export function useProfile(): Profile {
  return useSyncExternalStore(profileStore.subscribe, profileStore.get, profileStore.get);
}
