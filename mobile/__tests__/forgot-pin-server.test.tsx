/** ADR-046: forgot PIN against a fake server source. */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../src/api/client';
import { ServerForgotScreen } from '../src/features/auth/ServerForgotScreen';
import type { PinSource } from '../src/features/auth/serverPin';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

function fake(): jest.Mocked<PinSource> {
  return {
    change: jest.fn(async (_a: string, _b: string, _c: string) => undefined),
    resetStart: jest.fn(async (_p: string) => undefined),
    resetConfirm: jest.fn(
      async (_p: string, _s: string, _n: string, _x: { otp_code: string } | { recovery_code: string }) => undefined,
    ),
  };
}

async function toResetStep(src: PinSource): Promise<void> {
  await render(<ServerForgotScreen source={src} onBack={jest.fn()} />);
  await fireEvent.changeText(screen.getByTestId('forgot-phone'), '8038383838');
  await fireEvent.press(screen.getByTestId('forgot-submit'));
  await flush();
}

describe('Forgot PIN (server)', () => {
  it('texts a code, then needs the SMS code, the authenticator code and a new PIN', async () => {
    const src = fake();
    await toResetStep(src);
    expect(src.resetStart).toHaveBeenCalledWith('+2348038383838');
    await fireEvent.changeText(screen.getByTestId('forgot-sms'), '123456');
    await fireEvent.changeText(screen.getByTestId('forgot-otp'), '654321');
    await fireEvent.changeText(screen.getByTestId('forgot-pin'), '736195');
    await fireEvent.changeText(screen.getByTestId('forgot-pin2'), '736195');
    await fireEvent.press(screen.getByTestId('forgot-reset'));
    await flush();
    expect(src.resetConfirm).toHaveBeenCalledWith('+2348038383838', '123456', '736195', { otp_code: '654321' });
    expect(screen.getByTestId('forgot-back-login')).toBeTruthy();
  });

  it('can use a recovery code instead', async () => {
    const src = fake();
    await toResetStep(src);
    await fireEvent.press(screen.getByTestId('forgot-toggle-recovery'));
    await fireEvent.changeText(screen.getByTestId('forgot-sms'), '123456');
    await fireEvent.changeText(screen.getByTestId('forgot-recovery'), 'ABCD-EFGH-1234');
    await fireEvent.changeText(screen.getByTestId('forgot-pin'), '736195');
    await fireEvent.changeText(screen.getByTestId('forgot-pin2'), '736195');
    await fireEvent.press(screen.getByTestId('forgot-reset'));
    await flush();
    expect(src.resetConfirm).toHaveBeenCalledWith('+2348038383838', '123456', '736195', {
      recovery_code: 'ABCD-EFGH-1234',
    });
  });

  it('checks the form before asking the server, and shows the server refusal', async () => {
    const src = fake();
    await toResetStep(src);
    await fireEvent.changeText(screen.getByTestId('forgot-sms'), '123456');
    await fireEvent.changeText(screen.getByTestId('forgot-otp'), '654321');
    await fireEvent.changeText(screen.getByTestId('forgot-pin'), '736195');
    await fireEvent.changeText(screen.getByTestId('forgot-pin2'), '736196');
    await fireEvent.press(screen.getByTestId('forgot-reset'));
    expect(screen.getByTestId('forgot-error')).toHaveTextContent(/do not match/);
    expect(src.resetConfirm).not.toHaveBeenCalled();
    src.resetConfirm.mockRejectedValueOnce(new ApiError('AUTH_401_INVALID_CODE', 401, 'That code is not right.'));
    await fireEvent.changeText(screen.getByTestId('forgot-pin2'), '736195');
    await fireEvent.press(screen.getByTestId('forgot-reset'));
    await flush();
    expect(screen.getByTestId('forgot-error')).toHaveTextContent(/not right/);
  });

  it('refuses a malformed phone number without calling the server', async () => {
    const src = fake();
    await render(<ServerForgotScreen source={src} onBack={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('forgot-phone'), '12');
    await fireEvent.press(screen.getByTestId('forgot-submit'));
    expect(screen.getByTestId('forgot-error')).toBeTruthy();
    expect(src.resetStart).not.toHaveBeenCalled();
  });
});
