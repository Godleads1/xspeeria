/**
 * "Confirm it's you" for server builds (ADR-054). A sensitive action asks
 * `confirmIdentity(action, reason)` and gets a one-use approval for that action, or null when
 * the user cancels. `ServerConfirmHost`, mounted once at the root, does the asking:
 * Fingerprint/Face ID on a trusted phone, otherwise a face check (or, before the identity
 * check, an email code). Fail-closed: with no host mounted, or another request open, the
 * answer is null. The server checks the approval again; the app's answer is never trusted.
 */

import { useSyncExternalStore } from 'react';

import { authApi } from '../../api/authApi';
import { ApiError } from '../../api/client';
import { unlockKey } from '../../api/unlockKey';
import { serverAuth } from '../auth/serverAuth';
import { session } from '../auth/session';
import { tr } from '../../i18n';

export interface ConfirmRequest {
  readonly id: number;
  readonly action: string;
  readonly reason: string;
  readonly resolve: (approval: string | null) => void;
}

let pending: ConfirmRequest | null = null;
let nextId = 1;
let hosts = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function confirmIdentity(action: string, reason: string): Promise<string | null> {
  if (hosts === 0 || pending) return Promise.resolve(null);
  return new Promise<string | null>((resolve) => {
    pending = {
      id: nextId++,
      action,
      reason,
      resolve: (approval) => {
        pending = null;
        emit();
        resolve(approval);
      },
    };
    emit();
  });
}

export type ConfirmIdentity = typeof confirmIdentity;

export const confirmHostRegistry = {
  register(): () => void {
    hosts += 1;
    return () => {
      hosts -= 1;
      if (hosts === 0 && pending) pending.resolve(null);
    };
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  current: (): ConfirmRequest | null => pending,
};

export function usePendingConfirm(): ConfirmRequest | null {
  return useSyncExternalStore(confirmHostRegistry.subscribe, confirmHostRegistry.current, confirmHostRegistry.current);
}

export function accessToken(): string {
  const t = serverAuth.accessToken();
  if (!t) throw new ApiError('AUTH_401_UNAUTHORIZED', 401, tr('Please log in again.'));
  return t;
}

/**
 * Fingerprint/Face ID, when it is on for this phone: the key it releases buys the approval.
 * Null when it is off, cancelled or refused — then the sheet offers the other check.
 */
export async function approveWithBiometrics(action: string): Promise<string | null> {
  if (!session.biometricSaved() || !serverAuth.biometricSupported()) return null;
  const key = await unlockKey.read();
  if (!key) return null;
  try {
    return (await authApi.stepUp(accessToken(), action, key, serverAuth.apiOptions())).step_up_token;
  } catch (e) {
    // Too many failed checks is shown; anything else falls back to the face/email check.
    if (e instanceof ApiError && e.status === 429) throw e;
    return null;
  }
}
