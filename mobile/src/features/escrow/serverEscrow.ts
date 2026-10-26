/** Escrow steps against the real server (ADR-037). */

import { ApiError } from '../../api/client';
import { escrowApi, type ServerSettlement } from '../../api/escrowApi';
import { serverAuth } from '../auth/serverAuth';
import { tr } from "../../i18n";

function token(): string {
  const t = serverAuth.accessToken();
  if (!t) throw new ApiError('AUTH_401_UNAUTHORIZED', 401, tr("Please log in again."));
  return t;
}

export interface EscrowSource {
  get(matchId: string): Promise<ServerSettlement>;
  simulateTransfer(matchId: string): Promise<ServerSettlement>;
  /** ADR-059 Decision 4: 5 more minutes to pay, once, for the taker. */
  extend?(matchId: string): Promise<ServerSettlement>;
}

export const serverEscrow: EscrowSource = {
  get: async (matchId) => escrowApi.get(token(), matchId, serverAuth.apiOptions()),
  simulateTransfer: async (matchId) => escrowApi.simulateTransfer(token(), matchId, serverAuth.apiOptions()),
  extend: async (matchId) => escrowApi.extend(token(), matchId, serverAuth.apiOptions()),
};
