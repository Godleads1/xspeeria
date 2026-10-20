/**
 * Payout accounts against the real server (ADR-035/036). Each change spends a fresh
 * authenticator code as a one-use approval for that action (ADR-008).
 */

import { ApiError } from '../../api/client';
import { authApi } from '../../api/authApi';
import type { ServerMatch } from '../../api/offersApi';
import { offersApi } from '../../api/offersApi';
import { payoutsApi, type NewPayoutAccount, type ServerPayoutAccount } from '../../api/payoutsApi';
import { serverAuth } from '../auth/serverAuth';
import { tr } from "../../i18n";

function token(): string {
  const t = serverAuth.accessToken();
  if (!t) throw new ApiError('AUTH_401_UNAUTHORIZED', 401, tr("Please log in again."));
  return t;
}

async function approve(action: string, code: string): Promise<string> {
  return (await authApi.stepUp(token(), action, code, serverAuth.apiOptions())).step_up_token;
}

export interface PayoutSource {
  list(): Promise<ServerPayoutAccount[]>;
  add(account: NewPayoutAccount, code: string): Promise<ServerPayoutAccount>;
  remove(id: string, code: string): Promise<void>;
  match(matchId: string): Promise<ServerMatch>;
  choose(matchId: string, lines: { payout_account_id: string; amount: string }[], code: string): Promise<ServerMatch>;
}

export const serverPayouts: PayoutSource = {
  list: async () => payoutsApi.list(token(), serverAuth.apiOptions()),
  add: async (account, code) =>
    payoutsApi.add(token(), account, await approve('beneficiary.add', code), serverAuth.apiOptions()),
  remove: async (id, code) =>
    payoutsApi.remove(token(), id, await approve('beneficiary.remove', code), serverAuth.apiOptions()),
  match: async (matchId) => offersApi.match(token(), matchId, serverAuth.apiOptions()),
  choose: async (matchId, lines, code) =>
    payoutsApi.choose(token(), matchId, lines, await approve('payout.confirm', code), serverAuth.apiOptions()),
};

/** "Confirmed by your bank" etc. — plain words for each server state. */
export function accountStatus(a: ServerPayoutAccount): { label: string; tone: 'success' | 'warning' | 'error' | 'neutral' } {
  switch (a.validation_state) {
    case 'validated':
      return { label: tr("Confirmed"), tone: 'success' };
    case 'pending':
      return { label: tr("Bank check pending"), tone: 'warning' };
    case 'failed':
      return { label: tr("Bank could not confirm"), tone: 'error' };
    default:
      return { label: tr("No longer valid"), tone: 'neutral' };
  }
}
