/**
 * Delete account (ADR-095; owner 2026-11-03). The server decides everything: what blocks it,
 * the second check, and the 14 days to undo. The app only explains and asks.
 */

import { ApiError } from '../../api/client';
import { accountApi, type DeleteBlocker } from '../../api/accountApi';
import { tr } from '../../i18n';
import { serverAuth } from '../auth/serverAuth';
import { confirmIdentity } from '../security/serverConfirm';

export type DeleteOutcome =
  | { kind: 'blocked'; reasons: string[] }
  | { kind: 'cancelled' }
  | { kind: 'deleted'; restoreUntil: Date };

export interface DeleteDeps {
  check: () => Promise<DeleteBlocker[]>;
  remove: (approval: string) => Promise<string>;
  confirm: (action: string, reason: string) => Promise<string | null>;
}

export function blockerText(b: DeleteBlocker): string {
  switch (b) {
    case 'deal_in_progress':
      return tr('A deal is still in progress. Let it finish first.');
    case 'dispute_open':
      return tr('A dispute is still open.');
    case 'refund_pending':
      return tr('A refund is waiting for a decision.');
    case 'under_review':
      return tr('Our team is reviewing your account. Contact support.');
    default:
      return tr('Your account is frozen or suspended. Contact support.');
  }
}

function token(): string {
  const t = serverAuth.accessToken();
  if (!t) throw new ApiError('AUTH_401_UNAUTHORIZED', 401, tr('Please log in again.'));
  return t;
}

export const serverDeleteDeps: DeleteDeps = {
  check: async () => (await accountApi.deleteCheck(token(), serverAuth.apiOptions())).blockers,
  remove: async (approval) => (await accountApi.deleteAccount(token(), approval, serverAuth.apiOptions())).restore_until,
  confirm: confirmIdentity,
};

/** Check, ask for the second check, then delete. A refusal from the server is shown too. */
export async function deleteMyAccount(deps: DeleteDeps = serverDeleteDeps): Promise<DeleteOutcome> {
  const blockers = await deps.check();
  if (blockers.length) return { kind: 'blocked', reasons: blockers.map(blockerText) };
  const approval = await deps.confirm('account.delete', tr('Delete your account'));
  if (!approval) return { kind: 'cancelled' };
  try {
    return { kind: 'deleted', restoreUntil: new Date(await deps.remove(approval)) };
  } catch (e) {
    const found = e instanceof ApiError && Array.isArray(e.details?.blockers) ? (e.details.blockers as DeleteBlocker[]) : null;
    if (found) return { kind: 'blocked', reasons: found.map(blockerText) };
    throw e;
  }
}
