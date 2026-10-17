/** KYC-approved regions for the signed-in user (ADR-016). Mock, in memory. */

import { useSyncExternalStore } from 'react';

import { KYC_REGIONS, type KycRegion } from './data';
import { session } from '../auth/session';

let regions: readonly KycRegion[] = KYC_REGIONS;
const listeners = new Set<() => void>();

export const kycRegions = {
  get: (): readonly KycRegion[] => regions,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  has: (flag: string): boolean => regions.some((r) => r.flag === flag),
  /** A submitted region starts as pending; review happens server-side. */
  submit(region: { flag: string; name: string }): void {
    if (regions.some((r) => r.flag === region.flag)) return;
    regions = [...regions, { ...region, state: 'pending' }];
    for (const l of listeners) l();
  },
  /** Back to the initial state (log-out / new account, and tests). */
  reset(): void {
    regions = KYC_REGIONS;
    for (const l of listeners) l();
  },
};


// Cleared on log-out and when a new account is created (ADR-018).
session.onUserChange(() => kycRegions.reset());

export function useKycRegions(): readonly KycRegion[] {
  return useSyncExternalStore(kycRegions.subscribe, kycRegions.get, kycRegions.get);
}
