import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';

import { AuthenticatorSetupScreen, groupKey } from '../src/features/security/AuthenticatorSetupScreen';
import { StepUpHost } from '../src/features/security/StepUpHost';
import { TwoFactorScreen } from '../src/features/security/TwoFactorScreen';
import { requestStepUp } from '../src/features/security/stepUp';
import { base32Decode, totp } from '../src/features/security/totp';
import { LOCK_MS, MAX_ATTEMPTS, twoFactor, type RandomBytes } from '../src/features/security/twoFactorStore';

const NOW = 1_760_000_000_000;
let seed = 0;
const fakeRandom: RandomBytes = (n) => Uint8Array.from({ length: n }, () => (seed = (seed * 31 + 17) % 251));

function enrol(): { secret: string; codes: readonly string[] } {
  const secret = twoFactor.beginEnrolment(fakeRandom);
  // Enrol one time step before NOW, so the code at NOW has not been used yet (no replay).
  const at = NOW - 30_000;
  const codes = twoFactor.confirmEnrolment(totp(base32Decode(secret), at), at, fakeRandom);
  if (!codes) throw new Error('enrolment failed');
  return { secret, codes };
}

beforeEach(() => {
  seed = 7;
  twoFactor.reset();
});

describe('2FA rules', () => {
  it('uses a 160-bit secret and 10 unique recovery codes', () => {
    const { secret, codes } = enrol();
    expect(base32Decode(secret)).toHaveLength(20);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/);
  });

  it('refuses enrolment with a wrong code', () => {
    twoFactor.beginEnrolment(fakeRandom);
    expect(twoFactor.confirmEnrolment('000000', NOW, fakeRandom)).toBeNull();
    expect(twoFactor.isEnrolled()).toBe(false);
  });

  it('fails closed when not enrolled', () => {
    expect(twoFactor.verify('123456', NOW)).toMatchObject({ ok: false, reason: 'not-enrolled' });
  });

  it('accepts a current code and a recovery code once', () => {
    const { secret, codes } = enrol();
    expect(twoFactor.verify(totp(base32Decode(secret), NOW), NOW)).toEqual({ ok: true, usedRecoveryCode: false });
    expect(twoFactor.verify(codes[0].toLowerCase().replace('-', ''), NOW)).toEqual({ ok: true, usedRecoveryCode: true });
    expect(twoFactor.verify(codes[0], NOW).ok).toBe(false);
    expect(twoFactor.get().recoveryCodes).toHaveLength(9);
  });

  it('locks for 15 minutes after 5 wrong codes, even for a right code', () => {
    const { secret } = enrol();
    for (let i = 1; i < MAX_ATTEMPTS; i++) expect(twoFactor.verify('000000', NOW)).toMatchObject({ reason: 'wrong', attemptsLeft: MAX_ATTEMPTS - i });
    expect(twoFactor.verify('000000', NOW)).toMatchObject({ reason: 'locked' });
    const later = NOW + 60_000;
    expect(twoFactor.verify(totp(base32Decode(secret), later), later)).toMatchObject({ reason: 'locked' });
    const after = NOW + LOCK_MS + 1;
    expect(twoFactor.verify(totp(base32Decode(secret), after), after).ok).toBe(true);
  });

  it('groups the key for typing', () => {
    expect(groupKey('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
  });
});

describe('Authenticator setup screen', () => {
  it('blocks screenshots, shows QR + key, verifies and shows recovery codes once', async () => {
    const onDone = jest.fn();
    await render(<AuthenticatorSetupScreen account="d@example.com" random={fakeRandom} onBack={jest.fn()} onDone={onDone} now={() => NOW} />);
    expect(usePreventScreenCapture).toHaveBeenCalledWith('xspeeria-2fa-setup');
    expect(screen.getByTestId('authenticator-qr')).toBeTruthy();
    const secret = twoFactor.get().pendingSecret as string;
    expect(screen.getByTestId('authenticator-key').props.children).toBe(groupKey(secret));

    await fireEvent.changeText(screen.getByTestId('authenticator-code'), '000000');
    await fireEvent.press(screen.getByTestId('authenticator-verify'));
    expect(screen.getByTestId('authenticator-error')).toBeTruthy();
    expect(twoFactor.isEnrolled()).toBe(false);

    await fireEvent.changeText(screen.getByTestId('authenticator-code'), totp(base32Decode(secret), NOW));
    await fireEvent.press(screen.getByTestId('authenticator-verify'));
    expect(twoFactor.isEnrolled()).toBe(true);
    expect(screen.getByText('Save your recovery codes')).toBeTruthy();
    expect(screen.getByTestId('recovery-done').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('recovery-saved'));
    await fireEvent.press(screen.getByTestId('recovery-done'));
    expect(onDone).toHaveBeenCalled();
  });

  it('discards an unconfirmed secret when leaving', async () => {
    const { unmount } = await render(
      <AuthenticatorSetupScreen account="d@example.com" random={fakeRandom} onBack={jest.fn()} onDone={jest.fn()} />,
    );
    expect(twoFactor.get().pendingSecret).not.toBeNull();
    await unmount();
    expect(twoFactor.get().pendingSecret).toBeNull();
  });
});

describe('2FA overview', () => {
  it('offers setup when off and has no switch to turn it off', async () => {
    const onSetUp = jest.fn();
    await render(<TwoFactorScreen onBack={jest.fn()} onSetUpAuthenticator={onSetUp} stepUp={async () => true} random={fakeRandom} />);
    expect(screen.getByTestId('two-factor-status').props.children).toBe('2 FA is not set up');
    await fireEvent.press(screen.getByTestId('two-factor-authenticator'));
    expect(onSetUp).toHaveBeenCalled();
    expect(screen.getByTestId('two-factor-passkey').props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText(/never send codes by SMS/)).toBeTruthy();
  });

  it('new recovery codes need the 2FA re-check', async () => {
    const { codes } = enrol();
    const deny = jest.fn(async () => false);
    await render(<TwoFactorScreen onBack={jest.fn()} onSetUpAuthenticator={jest.fn()} stepUp={deny} random={fakeRandom} />);
    expect(screen.getByText('10 of 10 unused')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('two-factor-recovery'));
    expect(deny).toHaveBeenCalled();
    expect(twoFactor.get().recoveryCodes).toEqual(codes);
  });
});

describe('Step-up sheet', () => {
  it('fails closed with no sheet mounted', async () => {
    await expect(requestStepUp('Test')).resolves.toBe(false);
  });

  it('resolves true only after a valid code', async () => {
    const { secret } = enrol();
    await render(<StepUpHost onSetUp={jest.fn()} now={() => NOW} />);
    let result: boolean | undefined;
    await act(async () => {
      void requestStepUp('Remove beneficiary').then((r) => (result = r));
    });
    expect(screen.getByText('Remove beneficiary')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('step-up-code'), '111111');
    await fireEvent.press(screen.getByTestId('step-up-confirm'));
    expect(screen.getByTestId('step-up-error').props.children).toMatch(/4 tries left/);
    expect(result).toBeUndefined();
    await fireEvent.changeText(screen.getByTestId('step-up-code'), totp(base32Decode(secret), NOW));
    await fireEvent.press(screen.getByTestId('step-up-confirm'));
    expect(result).toBe(true);
    expect(screen.queryByTestId('step-up-sheet')).toBeNull();
  });

  it('cancel resolves false; no 2FA offers setup and refuses', async () => {
    const onSetUp = jest.fn();
    await render(<StepUpHost onSetUp={onSetUp} now={() => NOW} />);
    let result: boolean | undefined;
    await act(async () => {
      void requestStepUp('Add beneficiary').then((r) => (result = r));
    });
    expect(screen.getByTestId('step-up-not-enrolled')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('step-up-setup'));
    expect(result).toBe(false);
    expect(onSetUp).toHaveBeenCalled();
  });
});
