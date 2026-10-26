/** Disputes and support cases against the real server (ADR-057). */

import { ApiError } from '../../api/client';
import { disputesApi, type DisputeCategory, type DisputeReason, type ServerDispute } from '../../api/disputesApi';
import { serverAuth } from '../auth/serverAuth';
import { tr } from '../../i18n';

function token(): string {
  const t = serverAuth.accessToken();
  if (!t) throw new ApiError('AUTH_401_UNAUTHORIZED', 401, tr('Please log in again.'));
  return t;
}

export interface DisputeSource {
  /** The active categories (ADR-063). Optional: without it the app's built-in four are used. */
  categories?(): Promise<DisputeCategory[]>;
  mine(): Promise<ServerDispute[]>;
  get(id: string): Promise<ServerDispute>;
  /** With a transaction: a dispute on that deal (pauses its escrow). Without: a support case. */
  open(transactionId: string | null, reason: DisputeReason, description: string): Promise<ServerDispute>;
  message(id: string, text: string): Promise<ServerDispute>;
}

export const serverDisputes: DisputeSource = {
  categories: async () => disputesApi.categories(token(), serverAuth.apiOptions()),
  mine: async () => disputesApi.mine(token(), serverAuth.apiOptions()),
  get: async (id) => disputesApi.get(token(), id, serverAuth.apiOptions()),
  open: async (transactionId, reason, description) =>
    disputesApi.open(
      token(),
      { ...(transactionId ? { transaction_id: transactionId } : {}), reason, description },
      serverAuth.apiOptions(),
    ),
  message: async (id, text) => disputesApi.message(token(), id, text, serverAuth.apiOptions()),
};
