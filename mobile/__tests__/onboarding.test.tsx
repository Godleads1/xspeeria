import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEMO_ACCOUNT, DEMO_MODE } from '../src/features/auth/demo';
import { ForgotScreen } from '../src/features/auth/ForgotScreen';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import { pinProblem } from '../src/features/auth/pin';
import { MAX_PIN_TRIES, PIN_LOCK_MS, session } from '../src/features/auth/session';
import {
  CodeScreen,
  ConfirmPinScreen,
  CreatePinScreen,
  DetailsScreen,
  EnableBiometricsScreen,
  GetStartedScreen,
  VerifyIdentityScreen,
} from '../src/features/auth/SignupScreens';
import { signup } from '../src/features/auth/signupStore';
import { SLIDES, WelcomeScreen } from '../src/features/auth/WelcomeScreen';

const T0 = 1_760_000_000_000;
let seed = 9;
const rnd = (n: number): Uint8Array => Uint8Array.from({ length: n }, () => (seed = (seed * 57 + 13) % 256));

beforeEach(async () => {
  seed = 9;
  session.reset();
  signup.clear();
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

const typePin = async (pin: string): Promise<void> => {
  for (const d of pin) await fireEvent.press(screen.getByTestId(`pin-key-${d}`));
};

describe('PIN rules', () => {
  it('needs 4 digits and refuses obvious PINs', () => {
    expect(pinProblem('4826')).toBeNull();
    expect(pinProblem('123')).toMatch(/4 digits/);
    expect(pinProblem('1111')).toMatch(/same digit/);
    expect(pinProblem('1234')).toMatch(/sequences/);
    expect(pinProblem('4321')).toMatch(/sequences/);
    expect(pinProblem('8901')).toMatch(/sequences/);
  });
});

describe('session', () => {
  it('logs in with the demo phone or email and PIN, and never stores the PIN', async () => {
    expect(session.logIn('+234 803 838 3838', DEMO_ACCOUNT.pin, T0, true)).toEqual({ ok: true });
    expect(session.get().signedIn).toBe(true);
    expect(await AsyncStorage.getItem('xspeeria.rememberedLogin')).toBe(DEMO_ACCOUNT.phone);
    const all = await AsyncStorage.multiGet(await AsyncStorage.getAllKeys());
    expect(JSON.stringify(all)).not.toContain(DEMO_ACCOUNT.pin);
    session.logOut();
    expect(session.logIn('DavidPeters@Example.com', DEMO_ACCOUNT.pin, T0, false)).toEqual({ ok: true });
  });

  it('gives the same answer for a wrong PIN and an unknown account', () => {
    const a = session.logIn('+2348000000001', DEMO_ACCOUNT.pin, T0, false);
    session.reset();
    const b = session.logIn(DEMO_ACCOUNT.phone, '0000', T0, false);
    expect(a).toEqual(b);
  });

  it('locks for 15 minutes after 5 wrong tries, even with the right PIN', () => {
    for (let i = 1; i < MAX_PIN_TRIES; i++) expect(session.logIn(DEMO_ACCOUNT.phone, '0000', T0, false)).toMatchObject({ reason: 'wrong' });
    expect(session.logIn(DEMO_ACCOUNT.phone, '0000', T0, false)).toMatchObject({ reason: 'locked' });
    expect(session.logIn(DEMO_ACCOUNT.phone, DEMO_ACCOUNT.pin, T0 + 60_000, false)).toMatchObject({ reason: 'locked' });
    expect(session.logIn(DEMO_ACCOUNT.phone, DEMO_ACCOUNT.pin, T0 + PIN_LOCK_MS + 1, false)).toEqual({ ok: true });
  });

  it('biometric log-in only where it was turned on', () => {
    expect(session.logInWithBiometrics(T0)).toBe(false);
    session.setBiometric(true);
    expect(session.logInWithBiometrics(T0)).toBe(true);
  });

  it('demo mode is on and clearly labelled', () => {
    expect(DEMO_MODE).toBe(true);
  });
});

describe('Welcome', () => {
  it('shows Figma copy and both actions', async () => {
    const onSignUp = jest.fn();
    const onLogIn = jest.fn();
    await render(<WelcomeScreen onSignUp={onSignUp} onLogIn={onLogIn} />);
    expect(screen.getByText('Welcome to Xspeeria')).toBeTruthy();
    expect(SLIDES).toHaveLength(4);
    await fireEvent.press(screen.getByTestId('welcome-signup'));
    await fireEvent.press(screen.getByTestId('welcome-login'));
    expect(onSignUp).toHaveBeenCalled();
    expect(onLogIn).toHaveBeenCalled();
  });

  it('uses Figma titles and makes no claim Xspeeria cannot back (ADR-022)', () => {
    expect(SLIDES.map((x) => x.title)).toEqual([
      'Welcome to Xspeeria',
      'Exchange Money Peer-to-Peer',
      'Safe. Verified. Secure.',
      'Go Global, Seamlessly',
    ]);
    const text = SLIDES.map((x) => x.body).join(' ');
    expect(text).not.toMatch(/end-to-end encryption|prepaid card|instantly|guarantee|wallet|balance/i);
    expect(text).not.toMatch(/funds across borders/i);
    expect(text).toMatch(/no money crosses the border/);
  });

  it('each slide carries its own picture and text, so both swipe together', async () => {
    await render(<WelcomeScreen onSignUp={jest.fn()} onLogIn={jest.fn()} />);
    const sources = SLIDES.map((_, i) => screen.getByTestId(`welcome-hero-${i}`, { includeHiddenElements: true }).props.source);
    expect(new Set(sources).size).toBe(SLIDES.length);
    SLIDES.forEach((x, i) => {
      expect(within(screen.getByTestId(`welcome-slide-${i}`)).getByText(x.title)).toBeTruthy();
    });
  });

  it('progress bars follow the swipe and jump to a slide when tapped', async () => {
    await render(<WelcomeScreen onSignUp={jest.fn()} onLogIn={jest.fn()} />);
    const selected = (i: number): boolean | undefined => screen.getByTestId(`welcome-bar-${i}`).props.accessibilityState?.selected;
    expect(selected(0)).toBe(true);
    await fireEvent(screen.getByTestId('welcome-slides'), 'scroll', { nativeEvent: { contentOffset: { x: 10_000, y: 0 } } });
    expect(selected(3)).toBe(true);
    await fireEvent.press(screen.getByTestId('welcome-bar-1'));
    expect(selected(1)).toBe(true);
    expect(selected(3)).toBe(false);
  });
});

describe('Login screen', () => {
  it('demo fill logs in', async () => {
    const onDone = jest.fn();
    await render(<LoginScreen onDone={onDone} onSignUp={jest.fn()} onForgot={jest.fn()} now={() => T0} />);
    expect(screen.getByText('Welcome Back')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('login-demo-fill'));
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(onDone).toHaveBeenCalled();
    expect(session.get().signedIn).toBe(true);
  });

  it('wrong details show a neutral error and clear the PIN', async () => {
    const onDone = jest.fn();
    await render(<LoginScreen onDone={onDone} onSignUp={jest.fn()} onForgot={jest.fn()} now={() => T0} />);
    await fireEvent.press(screen.getByTestId('login-tab-email'));
    await fireEvent.changeText(screen.getByTestId('login-email'), 'someone@example.com');
    await fireEvent.changeText(screen.getByTestId('login-pin'), '9999');
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(screen.getByTestId('login-error').props.children).toMatch(/don’t match an account/);
    expect(screen.getByTestId('login-pin').props.value).toBe('');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('Face ID needs to be turned on first', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const bio = jest.fn(async () => 'ok' as const);
    const onDone = jest.fn();
    await render(<LoginScreen onDone={onDone} onSignUp={jest.fn()} onForgot={jest.fn()} biometrics={bio} />);
    await act(async () => fireEvent.press(screen.getByTestId('login-faceid')));
    expect(alert).toHaveBeenCalledWith('Face ID is off', expect.any(String));
    expect(bio).not.toHaveBeenCalled();
    await act(async () => session.setBiometric(true));
    await act(async () => fireEvent.press(screen.getByTestId('login-faceid')));
    expect(onDone).toHaveBeenCalled();
  });
});

describe('Forgot PIN', () => {
  it('gives the same message whether or not the account exists', async () => {
    await render(<ForgotScreen onBack={jest.fn()} />);
    expect(screen.getByText('Forgot Password')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('forgot-phone'), '8000000001');
    await fireEvent.press(screen.getByTestId('forgot-submit'));
    expect(screen.getByTestId('forgot-sent').props.children).toMatch(/If an account matches/);
  });
});

describe('Sign-up', () => {
  it('step 1 needs a valid NIN phone and both consents', async () => {
    const onNext = jest.fn();
    await render(<GetStartedScreen onNext={onNext} onLogIn={jest.fn()} onTerms={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('signup-phone'), '803 111 2222');
    expect(screen.getByTestId('signup-start-continue').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('signup-consent-aml'));
    await fireEvent.press(screen.getByTestId('signup-consent-terms'));
    await fireEvent.press(screen.getByTestId('signup-start-continue'));
    expect(signup.get().phone).toBe('+2348031112222');
    expect(onNext).toHaveBeenCalled();
  });

  it('identity check: date must match the NIN record before the (demo) selfie', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onVerified = jest.fn();
    await render(<VerifyIdentityScreen onBack={jest.fn()} onVerified={onVerified} onUseOtp={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('signup-dob'), '01011990');
    await fireEvent.press(screen.getByTestId('signup-open-camera'));
    expect(screen.getByTestId('signup-verify-error')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('signup-dob'), '12071997');
    await fireEvent.press(screen.getByTestId('signup-open-camera'));
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(alert.mock.calls[0][0]).toBe('Demo selfie check');
    await act(async () => buttons.find((b) => b.text === 'Continue as verified')?.onPress?.());
    expect(signup.get().identityVerified).toBe(true);
    expect(onVerified).toHaveBeenCalled();
  });

  it('OTP / email code: wrong code refused, right code accepted', async () => {
    const onVerified = jest.fn();
    await render(
      <CodeScreen testID="c" kind="phone" target="+2348031112222" title="Verify Your Identity" body="b" verifyLabel="Verify OTP" onBack={jest.fn()} onVerified={onVerified} random={rnd} now={() => T0} />,
    );
    expect(screen.getByText(/ending with \*\*\*\*\*\*2222/)).toBeTruthy();
    const code = (screen.getByTestId('c-demo').props.children as string[]).join('').match(/(\d{6})/)?.[1] as string;
    await fireEvent.changeText(screen.getByTestId('c-code'), code === '000000' ? '111111' : '000000');
    await fireEvent.press(screen.getByTestId('c-verify'));
    expect(screen.getByTestId('c-error')).toBeTruthy();
    expect(onVerified).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('c-code'), code);
    await fireEvent.press(screen.getByTestId('c-verify'));
    expect(onVerified).toHaveBeenCalled();
  });

  it('details: NIN fields are read-only, email required, newsletter off by default', async () => {
    const onNext = jest.fn();
    await render(<DetailsScreen onBack={jest.fn()} onNext={onNext} />);
    expect(screen.getByTestId('signup-first').props.children).toBe('David');
    expect(screen.getByTestId('signup-newsletter').props.accessibilityState).toEqual({ checked: false });
    await fireEvent.changeText(screen.getByTestId('signup-email'), 'bad');
    await fireEvent.press(screen.getByTestId('signup-details-continue'));
    expect(screen.getByTestId('signup-details-error')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('signup-email'), 'New@Example.com');
    await fireEvent.press(screen.getByTestId('signup-details-continue'));
    expect(signup.get().email).toBe('new@example.com');
    expect(onNext).toHaveBeenCalled();
  });

  it('create PIN refuses weak PINs; confirm must match', async () => {
    const onNext = jest.fn();
    await render(<CreatePinScreen onNext={onNext} />);
    await typePin('1234');
    expect(screen.getByTestId('signup-create-pin-error')).toBeTruthy();
    expect(onNext).not.toHaveBeenCalled();
    await typePin('4826');
    expect(signup.get().pin).toBe('4826');
    expect(onNext).toHaveBeenCalled();

    const ok = jest.fn();
    const restart = jest.fn();
    await render(<ConfirmPinScreen onNext={ok} onRestart={restart} />);
    await typePin('4826');
    expect(ok).toHaveBeenCalled();
  });

  it('confirm PIN mismatch clears the PIN and restarts', async () => {
    jest.useFakeTimers();
    signup.update({ pin: '4826' });
    const ok = jest.fn();
    const restart = jest.fn();
    await render(<ConfirmPinScreen onNext={ok} onRestart={restart} />);
    await typePin('4827');
    expect(ok).not.toHaveBeenCalled();
    expect(signup.get().pin).toBeNull();
    await act(async () => jest.advanceTimersByTime(1000));
    expect(restart).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('Face ID: turned on only after a successful check; Not now skips', async () => {
    const enable = jest.fn();
    const onNext = jest.fn();
    await render(<EnableBiometricsScreen onNext={onNext} enable={enable} biometrics={async () => 'failed'} />);
    await act(async () => fireEvent.press(screen.getByTestId('signup-enable-faceid')));
    expect(enable).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('signup-not-now'));
    expect(onNext).toHaveBeenCalledTimes(1);
    await render(<EnableBiometricsScreen onNext={onNext} enable={enable} biometrics={async () => 'ok'} />);
    await act(async () => fireEvent.press(screen.getByTestId('signup-enable-faceid')));
    expect(enable).toHaveBeenCalled();
  });
});
