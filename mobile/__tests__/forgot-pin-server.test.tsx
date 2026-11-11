/** ADR-046/054: forgot PIN against a fake server source: SMS code, new PIN, then the second check. */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { Check } from '../src/api/authApi';
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

const check = (method: Check['method']): Check => ({
  check_required: true,
  check_id: 'pr-1',
  purpose: 'pin_reset',
  method,
  email_hint: method === 'face' ? null : 'd***@example.com',
  phone_hint: null,
});

function fake(method: Check['method'] = 'email'): jest.Mocked<PinSource> {
  return {
    change: jest.fn(async (_a: string, _b: string, _c: string) => undefined),
    resetStart: jest.fn(async (_p: string) => undefined),
    resetVerify: jest.fn(async (_p: string, _s: string) => check(method)),
    resetFaceStart: jest.fn(async (_c: string) => 'https://verify.didit.me/s/9'),
    resetConfirm: jest.fn(async (_c: string, _n: string, _e: string | null) => undefined),
  };
}

async function toCheckStep(src: PinSource, openUrl = jest.fn(async () => undefined)): Promise<void> {
  await render(<ServerForgotScreen source={src} onBack={jest.fn()} openUrl={openUrl} />);
  await fireEvent.changeText(screen.getByTestId('forgot-phone'), '8038383838');
  await fireEvent.press(screen.getByTestId('forgot-submit'));
  await flush();
  await fireEvent.changeText(screen.getByTestId('forgot-sms'), '123456');
  await fireEvent.changeText(screen.getByTestId('forgot-pin'), '736195');
  await fireEvent.changeText(screen.getByTestId('forgot-pin2'), '736195');
  await fireEvent.press(screen.getByTestId('forgot-reset'));
  await flush();
}

describe('Forgot PIN (server)', () => {
  it('before the identity check: SMS code and new PIN, then the email code', async () => {
    const src = fake('email');
    await toCheckStep(src);
    expect(src.resetStart).toHaveBeenCalledWith('+2348038383838');
    expect(src.resetVerify).toHaveBeenCalledWith('+2348038383838', '123456');
    expect(screen.getByTestId('check-text')).toHaveTextContent(/d\*\*\*@example\.com/);
    await fireEvent.changeText(screen.getByTestId('check-email'), '654321');
    await fireEvent.press(screen.getByTestId('check-submit'));
    await flush();
    expect(src.resetConfirm).toHaveBeenCalledWith('pr-1', '736195', '654321');
    expect(screen.getByTestId('forgot-back-login')).toBeTruthy();
  });

  it('after the identity check: the face check', async () => {
    const src = fake('face');
    const openUrl = jest.fn(async () => undefined);
    await toCheckStep(src, openUrl);
    await fireEvent.press(screen.getByTestId('check-face'));
    await flush();
    expect(openUrl).toHaveBeenCalledWith('https://verify.didit.me/s/9');
    await fireEvent.press(screen.getByTestId('check-face'));
    await flush();
    expect(src.resetConfirm).toHaveBeenCalledWith('pr-1', '736195', null);
    expect(screen.getByTestId('forgot-back-login')).toBeTruthy();
  });

  it('when our team asked for a new identity check, the reset opens that check (ADR-104)', async () => {
    // Owner 2026-11-10: "Redo check, same ID" for someone whose selfie no longer matches.
    const src = fake('kyc');
    src.resetKycStart = jest.fn(async (_c: string) => 'https://verify.didit.me/s/redo');
    const openUrl = jest.fn(async () => undefined);
    await toCheckStep(src, openUrl);
    expect(screen.getByTestId('check-text')).toHaveTextContent(/new identity check/);
    await fireEvent.press(screen.getByTestId('check-face'));
    await flush();
    expect(src.resetKycStart).toHaveBeenCalledWith('pr-1');
    expect(src.resetFaceStart).not.toHaveBeenCalled();
    expect(openUrl).toHaveBeenCalledWith('https://verify.didit.me/s/redo');
    await fireEvent.press(screen.getByTestId('check-face'));
    await flush();
    expect(src.resetConfirm).toHaveBeenCalledWith('pr-1', '736195', null);
    expect(screen.getByTestId('forgot-back-login')).toBeTruthy();
  });

  it('checks the form before asking the server, and shows the server refusal', async () => {
    const src = fake();
    await render(<ServerForgotScreen source={src} onBack={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('forgot-phone'), '8038383838');
    await fireEvent.press(screen.getByTestId('forgot-submit'));
    await flush();
    await fireEvent.changeText(screen.getByTestId('forgot-sms'), '123456');
    await fireEvent.changeText(screen.getByTestId('forgot-pin'), '736195');
    await fireEvent.changeText(screen.getByTestId('forgot-pin2'), '736196');
    await fireEvent.press(screen.getByTestId('forgot-reset'));
    expect(screen.getByTestId('forgot-error')).toHaveTextContent(/do not match/);
    expect(src.resetVerify).not.toHaveBeenCalled();
    src.resetVerify.mockRejectedValueOnce(new ApiError('AUTH_401_INVALID_OTP', 401, 'That code is not right.'));
    await fireEvent.changeText(screen.getByTestId('forgot-sms'), '123456');
    await fireEvent.changeText(screen.getByTestId('forgot-pin2'), '736195');
    await fireEvent.press(screen.getByTestId('forgot-reset'));
    await flush();
    expect(screen.getByTestId('forgot-error')).toHaveTextContent(/not right/);
  });

  it('an expired check goes back to the start with the server’s message', async () => {
    const src = fake('email');
    src.resetConfirm.mockRejectedValueOnce(new ApiError('AUTH_410_CHALLENGE_EXPIRED', 410, 'This step has expired. Please start again.'));
    await toCheckStep(src);
    await fireEvent.changeText(screen.getByTestId('check-email'), '654321');
    await fireEvent.press(screen.getByTestId('check-submit'));
    await flush();
    expect(screen.getByTestId('forgot-phone')).toBeTruthy();
    expect(screen.getByTestId('forgot-error')).toHaveTextContent(/expired/);
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
