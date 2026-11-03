/** Delete account (ADR-095): blockers explained, the second check, restore at log-in. */

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { ApiError } from '../src/api/client';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import { deleteMyAccount, type DeleteDeps } from '../src/features/profile/deleteAccount';

function deps(over: Partial<DeleteDeps> = {}): DeleteDeps {
  return {
    check: jest.fn(async () => []),
    remove: jest.fn(async () => '2026-11-17T12:00:00Z'),
    confirm: jest.fn(async () => 'approval-1'),
    ...over,
  };
}

describe('deleting my account', () => {
  it('asks for the second check, then deletes', async () => {
    const d = deps();
    const out = await deleteMyAccount(d);
    expect(d.confirm).toHaveBeenCalledWith('account.delete', expect.any(String));
    expect(d.remove).toHaveBeenCalledWith('approval-1');
    expect(out).toEqual({ kind: 'deleted', restoreUntil: new Date('2026-11-17T12:00:00Z') });
  });

  it('explains what blocks it, without asking for the second check', async () => {
    const d = deps({ check: jest.fn(async () => ['deal_in_progress' as const, 'dispute_open' as const]) });
    const out = await deleteMyAccount(d);
    expect(out.kind).toBe('blocked');
    expect(out.kind === 'blocked' && out.reasons).toEqual(['A deal is still in progress. Let it finish first.', 'A dispute is still open.']);
    expect(d.confirm).not.toHaveBeenCalled();
  });

  it('cancelling the second check deletes nothing', async () => {
    const d = deps({ confirm: jest.fn(async () => null) });
    expect(await deleteMyAccount(d)).toEqual({ kind: 'cancelled' });
    expect(d.remove).not.toHaveBeenCalled();
  });

  it('a refusal from the server (something opened meanwhile) is explained too', async () => {
    const refused = new ApiError('RES_409_ACCOUNT_DELETE_BLOCKED', 409, 'no', null, { blockers: ['refund_pending'] });
    const out = await deleteMyAccount(deps({ remove: jest.fn(async () => Promise.reject(refused)) }));
    expect(out).toEqual({ kind: 'blocked', reasons: ['A refund is waiting for a decision.'] });
  });
});

describe('restoring at log-in', () => {
  it('offers Restore for an account being deleted, then logs in with restore', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const deleting = new ApiError('AUTH_403_ACCOUNT_DELETING', 403, 'deleting', null, { restore_until: '2026-11-17T12:00:00Z' });
    const login = jest.fn().mockRejectedValueOnce(deleting).mockResolvedValueOnce('check');
    const onSecondFactor = jest.fn();
    await render(
      <LoginScreen onDone={jest.fn()} onSignUp={jest.fn()} onForgot={jest.fn()} server={{ login }} onSecondFactor={onSecondFactor} />,
    );
    await fireEvent.changeText(screen.getByTestId('login-phone'), '8038383838');
    await fireEvent.changeText(screen.getByTestId('login-pin'), '123456');
    await fireEvent.press(screen.getByTestId('login-submit'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    const [title, , buttons] = alert.mock.calls[0];
    expect(title).toBe('Restore your account?');
    const restore = (buttons ?? []).find((b) => b.text === 'Restore');
    restore?.onPress?.();
    await waitFor(() => expect(login).toHaveBeenLastCalledWith('+2348038383838', '123456', expect.any(Number), { restore: true }));
    await waitFor(() => expect(onSecondFactor).toHaveBeenCalled());
    alert.mockRestore();
  });
});
