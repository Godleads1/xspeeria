/** In-progress sign-up (ADR-013). Memory only; cleared when sign-up finishes or is abandoned. */

import { useSyncExternalStore } from 'react';

export interface SignupDraft {
  readonly phone: string | null;
  readonly identityVerified: boolean;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly newsletter: boolean;
  readonly pin: string | null;
}

const EMPTY: SignupDraft = { phone: null, identityVerified: false, email: null, emailVerified: false, newsletter: false, pin: null };
let draft: SignupDraft = EMPTY;
const listeners = new Set<() => void>();

export const signup = {
  get: (): SignupDraft => draft,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  update(next: Partial<SignupDraft>): void {
    draft = { ...draft, ...next };
    for (const l of listeners) l();
  },
  clear(): void {
    draft = EMPTY;
    for (const l of listeners) l();
  },
};

export function useSignup(): SignupDraft {
  return useSyncExternalStore(signup.subscribe, signup.get, signup.get);
}
