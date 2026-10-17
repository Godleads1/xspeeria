/**
 * Step-up re-check (ADR-008): sensitive actions call `requestStepUp(reason)` and proceed only
 * when it resolves `true`. The sheet that asks for the code is `StepUpHost`, mounted once at
 * the root. Fail-closed: with no host mounted, or if another check is already open, the
 * request resolves `false`. The server repeats this check; the app's answer is never trusted.
 */

import { useSyncExternalStore } from 'react';

export interface StepUpRequest {
  readonly reason: string;
  readonly resolve: (ok: boolean) => void;
}

let pending: StepUpRequest | null = null;
let hosts = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function requestStepUp(reason: string): Promise<boolean> {
  if (hosts === 0 || pending) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    pending = {
      reason,
      resolve: (ok) => {
        pending = null;
        emit();
        resolve(ok);
      },
    };
    emit();
  });
}

export type StepUp = (reason: string) => Promise<boolean>;

export const stepUpHostRegistry = {
  register(): () => void {
    hosts += 1;
    return () => {
      hosts -= 1;
      if (hosts === 0 && pending) pending.resolve(false);
    };
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  current: (): StepUpRequest | null => pending,
};

export function usePendingStepUp(): StepUpRequest | null {
  return useSyncExternalStore(stepUpHostRegistry.subscribe, stepUpHostRegistry.current, stepUpHostRegistry.current);
}
