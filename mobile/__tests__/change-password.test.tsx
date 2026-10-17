import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { ChangePasswordScreen } from '../src/features/profile/ChangePasswordScreen';
import { validatePasswordForm } from '../src/features/profile/passwordForm';

describe('validatePasswordForm', () => {
  it('requires all fields', () => {
    expect(Object.keys(validatePasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' }))).toEqual([
      'oldPassword', 'newPassword', 'confirmPassword',
    ]);
  });

  it('rejects a mismatch and reusing the old password', () => {
    expect(validatePasswordForm({ oldPassword: 'a1', newPassword: 'b2', confirmPassword: 'b3' })).toEqual({
      confirmPassword: 'Passwords do not match',
    });
    expect(validatePasswordForm({ oldPassword: 'a1', newPassword: 'a1', confirmPassword: 'a1' }).newPassword).toBeTruthy();
  });

  it('does not invent a length or complexity policy (Open Decision 2)', () => {
    expect(validatePasswordForm({ oldPassword: 'x', newPassword: 'y', confirmPassword: 'y' })).toEqual({});
  });
});

describe('Change Password screen', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders the Figma fields masked', async () => {
    await render(<ChangePasswordScreen onBack={jest.fn()} />);
    for (const l of ['Enter Old Password *', 'Enter New Password *', 'Confirm New Password *']) expect(screen.getByText(l)).toBeTruthy();
    for (const k of ['oldPassword', 'newPassword', 'confirmPassword']) {
      expect(screen.getByTestId(`password-${k}`).props.secureTextEntry).toBe(true);
    }
  });

  it('shows errors and does not submit an invalid form', async () => {
    const onSubmit = jest.fn();
    await render(<ChangePasswordScreen onBack={jest.fn()} onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByTestId('password-oldPassword'), 'old-one');
    await fireEvent.changeText(screen.getByTestId('password-newPassword'), 'new-one');
    await fireEvent.changeText(screen.getByTestId('password-confirmPassword'), 'new-two');
    await fireEvent.press(screen.getByTestId('change-password-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('password-error-confirmPassword')).toBeTruthy();
  });

  it('submits a valid form and clears the fields', async () => {
    const onSubmit = jest.fn();
    await render(<ChangePasswordScreen onBack={jest.fn()} onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByTestId('password-oldPassword'), 'old-one');
    await fireEvent.changeText(screen.getByTestId('password-newPassword'), 'new-one');
    await fireEvent.changeText(screen.getByTestId('password-confirmPassword'), 'new-one');
    await fireEvent.press(screen.getByTestId('change-password-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ oldPassword: 'old-one', newPassword: 'new-one', confirmPassword: 'new-one' });
    expect(screen.getByTestId('password-newPassword').props.value).toBe('');
  });

  it('without a backend, says nothing was changed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<ChangePasswordScreen onBack={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('password-oldPassword'), 'a');
    await fireEvent.changeText(screen.getByTestId('password-newPassword'), 'b');
    await fireEvent.changeText(screen.getByTestId('password-confirmPassword'), 'b');
    await fireEvent.press(screen.getByTestId('change-password-submit'));
    expect(alert.mock.calls[0][1]).toMatch(/has not been changed/);
  });
});
