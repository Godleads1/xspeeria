/**
 * ADR-024: 6-digit PIN, 5-minute idle lock, 7-day maximum session.
 */
import { render, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { LoginScreen } from '../src/features/auth/LoginScreen';
import { DEMO_ACCOUNT } from '../src/features/auth/demo';
import { pinProblem, PIN_LENGTH } from '../src/features/auth/pin';
import { IDLE_LOCK_MS, SESSION_MAX_MS, session } from '../src/features/auth/session';
import { useIdleLock } from '../src/features/auth/useIdleLock';

const T0 = Date.UTC(2026, 9, 18, 9, 0, 0);
const MIN = 60_000;

beforeEach(() => session.reset());

function logIn(at = T0): void {
  expect(session.logIn(DEMO_ACCOUNT.phone, DEMO_ACCOUNT.pin, at, false)).toEqual({ ok: true });
}

describe('PIN length (ADR-024)', () => {
  it('is 6 digits; the demo PIN is a valid 6-digit PIN', () => {
    expect(PIN_LENGTH).toBe(6);
    expect(DEMO_ACCOUNT.pin).toHaveLength(6);
    expect(pinProblem(DEMO_ACCOUNT.pin)).toBeNull();
    expect(pinProblem('48261')).toMatch(/6 digits/);
    expect(pinProblem('4826135')).toMatch(/6 digits/);
  });
});

describe('idle lock (5 minutes)', () => {
  it('stays signed in just under 5 minutes and locks at 5 minutes', () => {
    logIn();
    expect(session.enforceTimeouts(T0 + IDLE_LOCK_MS - 1)).toBeNull();
    expect(session.get().signedIn).toBe(true);
    expect(session.enforceTimeouts(T0 + IDLE_LOCK_MS)).toBe('idle');
    expect(session.get()).toMatchObject({ signedIn: false, endedBy: 'idle' });
    expect(IDLE_LOCK_MS).toBe(5 * MIN);
  });

  it('activity resets the idle clock', () => {
    logIn();
    session.touch(T0 + 4 * MIN);
    expect(session.enforceTimeouts(T0 + 8 * MIN)).toBeNull();
    expect(session.enforceTimeouts(T0 + 9 * MIN)).toBe('idle');
  });

  it('a touch while signed out does not count', () => {
    session.touch(T0);
    expect(session.enforceTimeouts(T0 + 10 * MIN)).toBeNull();
  });

  it('keeps the user data after an idle lock but clears it on expiry', () => {
    const cleared = jest.fn();
    const off = session.onUserChange(cleared);
    logIn();
    session.enforceTimeouts(T0 + IDLE_LOCK_MS);
    expect(cleared).not.toHaveBeenCalled();
    logIn(T0 + IDLE_LOCK_MS + 1);
    session.enforceTimeouts(T0 + SESSION_MAX_MS + 2 * IDLE_LOCK_MS);
    expect(cleared).toHaveBeenCalledTimes(1);
    off();
  });
});

describe('maximum session (7 days)', () => {
  it('ends the session 7 days after the PIN log-in even with activity', () => {
    logIn();
    expect(SESSION_MAX_MS).toBe(7 * 24 * 60 * MIN);
    session.touch(T0 + SESSION_MAX_MS - 1);
    expect(session.enforceTimeouts(T0 + SESSION_MAX_MS - 1)).toBeNull();
    session.touch(T0 + SESSION_MAX_MS);
    expect(session.enforceTimeouts(T0 + SESSION_MAX_MS)).toBe('expired');
    expect(session.get()).toMatchObject({ signedIn: false, endedBy: 'expired', signedInAt: 0 });
  });

  it('biometrics unlock an idle session but cannot extend past 7 days', () => {
    logIn();
    session.setBiometric(true);
    session.enforceTimeouts(T0 + IDLE_LOCK_MS);
    expect(session.logInWithBiometrics(T0 + IDLE_LOCK_MS + 1)).toBe(true);
    expect(session.get().signedInAt).toBe(T0);
    session.enforceTimeouts(T0 + SESSION_MAX_MS);
    expect(session.logInWithBiometrics(T0 + SESSION_MAX_MS + 1)).toBe(false);
    expect(session.get().signedIn).toBe(false);
    session.setBiometric(false);
  });

  it('the 7-day clock survives an app restart; log-out forgets it', async () => {
    logIn();
    session.setBiometric(true);
    session.reset(); // the app is closed: memory is gone, storage stays
    await session.restore();
    expect(session.get().signedInAt).toBe(T0);
    expect(session.logInWithBiometrics(T0 + 60 * MIN)).toBe(true);
    session.logOut();
    session.reset();
    await session.restore();
    expect(session.get().signedInAt).toBe(0);
    expect(session.logInWithBiometrics(T0 + 61 * MIN)).toBe(false);
    session.setBiometric(false);
  });

  it('a new PIN log-in starts a new 7 days', () => {
    logIn();
    session.enforceTimeouts(T0 + SESSION_MAX_MS);
    logIn(T0 + SESSION_MAX_MS + 1);
    expect(session.enforceTimeouts(T0 + SESSION_MAX_MS + 2)).toBeNull();
    expect(session.get().endedBy).toBeNull();
  });
});

describe('log-in screen explains why', () => {
  it.each([
    ['idle', /5 minutes without use/],
    ['expired', /after 7 days/],
  ] as const)('%s', async (reason, text) => {
    logIn();
    session.enforceTimeouts(reason === 'idle' ? T0 + IDLE_LOCK_MS : T0 + SESSION_MAX_MS);
    await render(<LoginScreen onDone={jest.fn()} onSignUp={jest.fn()} onForgot={jest.fn()} now={() => T0} />);
    expect(screen.getByTestId('login-ended').props.children).toMatch(text);
  });

  it('shows nothing after a normal log-out', async () => {
    logIn();
    session.logOut();
    await render(<LoginScreen onDone={jest.fn()} onSignUp={jest.fn()} onForgot={jest.fn()} now={() => T0} />);
    expect(screen.queryByTestId('login-ended')).toBeNull();
  });
});

describe('useIdleLock', () => {
  function Probe({ now }: { now: () => number }): null {
    useIdleLock(now);
    return null;
  }

  it('locks on the periodic check and when the app returns to the foreground', async () => {
    jest.useFakeTimers();
    let clock = T0;
    const now = (): number => clock;
    const listeners: ((s: string) => void)[] = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, fn) => {
      listeners.push(fn as (s: string) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    logIn();
    await render(<Probe now={now} />);
    clock = T0 + IDLE_LOCK_MS;
    for (const l of listeners) l('active');
    expect(session.get().endedBy).toBe('idle');

    logIn(clock);
    clock += IDLE_LOCK_MS;
    jest.advanceTimersByTime(15_000);
    expect(session.get().signedIn).toBe(false);
    spy.mockRestore();
    jest.useRealTimers();
  });
});
