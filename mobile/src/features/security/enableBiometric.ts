/**
 * Turning Face ID/fingerprint on from Security (F-007, security review of 2026-10-28).
 */

import { ApiError } from '../../api/client';
import { serverAuth } from '../auth/serverAuth';
import { tr } from '../../i18n';
import { confirmIdentity } from './serverConfirm';

/**
 * Turn on Face ID/fingerprint. Past the first minutes after sign-in the server asks for a fresh
 * "Confirm it's you" first (F-007); cancelling it leaves the setting off.
 */
export async function enableWithApproval(
  enable: (approval?: string | null) => Promise<void> = (a) => serverAuth.enableBiometric(a ?? null),
  confirm: typeof confirmIdentity = confirmIdentity,
): Promise<void> {
  try {
    await enable();
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 403 && e.code === 'AUTH_403_FORBIDDEN')) throw e;
    const approval = await confirm('biometric.enable', tr("Enable Face ID"));
    if (!approval) throw e;
    await enable(approval);
  }
}
