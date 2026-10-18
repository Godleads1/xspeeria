/**
 * In-memory beneficiary list shared by Manage Beneficiaries and the add flow (MOCK ONLY;
 * lost on reload). Holds only the last 4 digits of any account number: the full number
 * is sent once to the server, which stores a tokenised `account_ref` (API Data Dictionary,
 * BENEFICIARIES). With no backend yet, the full number is discarded here.
 */

import { useSyncExternalStore } from 'react';

import { BENEFICIARIES, type Beneficiary } from './data';
import { session } from '../auth/session';

let items: readonly Beneficiary[] = BENEFICIARIES;
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export const beneficiaryStore = {
  get: (): readonly Beneficiary[] => items,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  add(input: { currency: string; bank: string; accountNumber: string; name: string }): Beneficiary {
    const b: Beneficiary = {
      id: `new-${nextId++}`,
      name: input.name,
      currency: input.currency,
      bank: input.bank.trim(),
      accountLast4: input.accountNumber.slice(-4),
      status: 'pending',
    };
    items = [...items, b];
    emit();
    return b;
  },
  remove(id: string): void {
    items = items.filter((b) => b.id !== id);
    emit();
  },
  /** Back to the initial state (log-out / new account, and tests). */
  reset(): void {
    items = BENEFICIARIES;
    nextId = 1;
    emit();
  },
};


// Cleared on log-out and when a new account is created (ADR-018).
session.onUserChange(() => beneficiaryStore.reset());

export function useBeneficiaries(): readonly Beneficiary[] {
  return useSyncExternalStore(beneficiaryStore.subscribe, beneficiaryStore.get, beneficiaryStore.get);
}
