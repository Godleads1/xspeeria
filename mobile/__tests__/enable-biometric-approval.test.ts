/**
 * F-007 (security review of 2026-10-28): turning Face ID/fingerprint on later than the first
 * minutes after sign-in needs a fresh "Confirm it's you"; the server decides, the app follows.
 */
import { ApiError } from '../src/api/client';
import { enableWithApproval } from '../src/features/security/enableBiometric';

const needsApproval = new ApiError('AUTH_403_FORBIDDEN', 403, "Please confirm it's you first.");

describe('turning on Face ID from Security', () => {
  it('needs no approval when the server accepts straight away', async () => {
    const enable = jest.fn().mockResolvedValue(undefined);
    const confirm = jest.fn();
    await enableWithApproval(enable, confirm);
    expect(enable).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks "Confirm it\'s you" for biometric.enable, then tries again with the approval', async () => {
    const enable = jest.fn().mockRejectedValueOnce(needsApproval).mockResolvedValueOnce(undefined);
    const confirm = jest.fn().mockResolvedValue('approval-1');
    await enableWithApproval(enable, confirm);
    expect(confirm).toHaveBeenCalledWith('biometric.enable', expect.any(String));
    expect(enable).toHaveBeenLastCalledWith('approval-1');
  });

  it('stays off when the person cancels', async () => {
    const enable = jest.fn().mockRejectedValue(needsApproval);
    await expect(enableWithApproval(enable, jest.fn().mockResolvedValue(null))).rejects.toBe(needsApproval);
    expect(enable).toHaveBeenCalledTimes(1);
  });

  it('does not ask for an approval on other refusals', async () => {
    const untrusted = new ApiError('AUTH_403_DEVICE_NOT_TRUSTED', 403, 'Needs a trusted phone.');
    const confirm = jest.fn();
    await expect(enableWithApproval(jest.fn().mockRejectedValue(untrusted), confirm)).rejects.toBe(untrusted);
    expect(confirm).not.toHaveBeenCalled();
  });
});
