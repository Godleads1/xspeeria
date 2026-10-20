/**
 * The signed-in user's editable profile (ADR-011). MOCK, in memory: the server is the source
 * of truth and must re-verify every change. Phone and email change only after a code sent to
 * the NEW address is confirmed; date of birth changes only after an ID check (pending until
 * then). Photos are local file URIs, re-encoded to strip metadata before use.
 */

import { useSyncExternalStore } from 'react';

import { SERVER_MODE } from '../../api/config';
import { session } from '../auth/session';
import { PROFILE_USER, nameInitials, type ProfileUser } from './data';

export interface PendingDob {
  readonly dateOfBirth: string;
  readonly submittedAt: number;
}

export interface Profile extends ProfileUser {
  readonly avatarUri: string | null;
  readonly bannerUri: string | null;
  readonly pendingDob: PendingDob | null;
}

/**
 * Server builds start empty and are filled from the server after sign-in (ADR-055): no sample
 * person is ever shown as the user. Demo builds keep the Figma sample (David Peters).
 */
const BLANK: ProfileUser = {
  fullName: '',
  initials: '',
  handle: '',
  ratingHundredths: 0,
  phone: '',
  email: '',
  dateOfBirth: '',
  gender: '',
};

const INITIAL: Profile = { ...(SERVER_MODE ? BLANK : PROFILE_USER), avatarUri: null, bannerUri: null, pendingDob: null };

export interface ServerIdentity {
  readonly userId: string;
  readonly phone: string;
  readonly email: string;
  /** From the approved identity check; null before it (ADR-055). */
  readonly legalName: string | null;
  readonly dateOfBirth: string | null;
  readonly gender: 'M' | 'F' | null;
}

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
  /** Server builds: the account and the identity from the ID check (ADR-055). */
  setServerIdentity(id: ServerIdentity): void {
    const name = id.legalName?.trim() ?? '';
    set({
      fullName: name,
      initials: nameInitials(name, id.email.slice(0, 1)),
      // Public handle shown to the other side of a deal instead of the real name.
      handle: `User ${id.userId.replace(/[^0-9a-f]/gi, '').slice(0, 4).toUpperCase()}`,
      ratingHundredths: 0,
      phone: id.phone,
      email: id.email,
      dateOfBirth: id.dateOfBirth ?? '',
      gender: id.gender ?? '',
    });
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
