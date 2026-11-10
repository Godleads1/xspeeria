/**
 * Regression tests for the independent security / QA / financial review of 2026-10-17
 * (ADR-018). Each block names the finding it proves fixed.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { CodeScreen } from '../src/features/auth/SignupScreens';
import { DEMO_ACCOUNT, DEMO_MODE, isDemoBuild } from '../src/features/auth/demo';
import { session } from '../src/features/auth/session';
import { ReceiptScreen } from '../src/features/history/ReceiptScreen';
import type { HistoryItem } from '../src/features/history/data';
import { OFFERS } from '../src/features/market/data';
import { parsePositiveInt, parseToHundredths, quoteMinor, quoteMinorOrNull } from '../src/features/market/money';
import { beneficiaryStore } from '../src/features/profile/beneficiaryStore';
import { BENEFICIARIES, isValidRoutingNumber } from '../src/features/profile/data';
import { kycRegions } from '../src/features/profile/kycRegions';
import { profileStore } from '../src/features/profile/profileStore';
import { securitySettings } from '../src/features/profile/securitySettings';
import { RESEND_AFTER_MS } from '../src/features/profile/verification';
import { CLEAR_AFTER_MS, copySensitive } from '../src/features/security/sensitiveClipboard';
import { LOCK_MS, MAX_ATTEMPTS, twoFactor } from '../src/features/security/twoFactorStore';
import { base32Decode, totp } from '../src/features/security/totp';
import { sensitiveWarning } from '../src/features/support/assistant';
import { DEMO_STEP_MS, FUNDING_WINDOW_MS, toHistoryItem, tradeStore } from '../src/features/trade/tradeStore';

const NOW = 1_760_000_000_000;
let seed = 3;
const rnd = (n: number): Uint8Array => Uint8Array.from({ length: n }, () => (seed = (seed * 41 + 7) % 256));
const PAYOUT = { id: 'b3', name: 'David Peters', bank: 'Chase', last4: '4410' };
const offer = OFFERS[0]; // 200.00 USD at 1,893.00

function enrol(at = NOW - 30_000): string {
  const secret = twoFactor.beginEnrolment(rnd);
  if (!twoFactor.confirmEnrolment(totp(base32Decode(secret), at), at, rnd)) throw new Error('enrol failed');
  return secret;
}

beforeEach(() => {
  seed = 3;
  session.reset();
  for (const s of [twoFactor, tradeStore, beneficiaryStore, profileStore, kycRegions, securitySettings]) s.reset();
  jest.useRealTimers();
});
afterEach(() => jest.useRealTimers());

describe('SEC-01: demo behaviour exists only in development builds', () => {
  it('derives DEMO_MODE from the build, never from a hand-set constant', () => {
    expect(isDemoBuild(true)).toBe(true);
    expect(isDemoBuild(false)).toBe(false);
    expect(isDemoBuild(undefined)).toBe(false);
    expect(DEMO_MODE).toBe(true); // jest runs as a development build
  });

  it('in a release build: no demo log-in, no biometric log-in, no sign-up, no self-completing trade', () => {
    jest.isolateModules(() => {
      jest.doMock('../src/features/auth/demo', () => ({ ...jest.requireActual('../src/features/auth/demo'), DEMO_MODE: false }));
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { session: s } = require('../src/features/auth/session') as typeof import('../src/features/auth/session');
      const { tradeStore: ts } = require('../src/features/trade/tradeStore') as typeof import('../src/features/trade/tradeStore');
      /* eslint-enable @typescript-eslint/no-require-imports */
      expect(s.logIn(DEMO_ACCOUNT.phone, DEMO_ACCOUNT.pin, NOW, false)).toEqual({ ok: false, reason: 'unavailable' });
      s.setBiometric(true);
      expect(s.logInWithBiometrics(NOW)).toBe(false);
      expect(() => s.completeSignUp({ phone: '+2348031112222', email: 'a@example.com', pin: '739152' })).toThrow();
      expect(s.get().signedIn).toBe(false);

      const t = ts.create({ side: 'buy', listing: offer, amountMinor: 10000, payout: PAYOUT, now: NOW, random: rnd });
      ts.markPaid(t.id, NOW);
      for (let i = 1; i <= 5; i++) ts.tick(t.id, NOW + i * DEMO_STEP_MS);
      expect(ts.get(t.id)?.phase).toBe('confirming'); // only bank evidence may move it on
      ts.requestExtension(t.id, NOW); // no-op after paying, but the demo approval path is off too
      jest.dontMock('../src/features/auth/demo');
    });
  });
});

describe('SEC-03 / QA-02: log-out and a new account clear the previous user', () => {
  function fillUserData(): void {
    enrol();
    beneficiaryStore.add({ currency: 'USD', bank: 'Chase', accountNumber: '123456789', name: 'David Peters' });
    tradeStore.create({ side: 'buy', listing: offer, amountMinor: 10000, payout: PAYOUT, now: NOW, random: rnd });
    profileStore.setAvatar('file:///avatar.jpg');
    kycRegions.submit({ flag: 'US', name: 'United States' });
    securitySettings.setAllowScreenshots(false);
  }

  function expectCleared(): void {
    expect(twoFactor.isEnrolled()).toBe(false);
    expect(twoFactor.get().recoveryCodes).toHaveLength(0);
    expect(beneficiaryStore.get()).toEqual(BENEFICIARIES);
    expect(tradeStore.get(tradeStore.get('nope')?.id ?? '')).toBeUndefined();
    expect(profileStore.get().avatarUri).toBeNull();
    expect(kycRegions.has('US')).toBe(false);
    expect(securitySettings.get().allowScreenshots).toBe(true);
  }

  it('log-out clears every user-scoped store', () => {
    expect(session.logIn(DEMO_ACCOUNT.phone, DEMO_ACCOUNT.pin, NOW, false).ok).toBe(true);
    fillUserData();
    session.logOut();
    expect(session.get().signedIn).toBe(false);
    expectCleared();
  });

  it('a new sign-up never inherits the earlier user, and Face ID is on only if chosen', () => {
    session.setBiometric(true); // the earlier account had Face ID on
    fillUserData();
    session.completeSignUp({ phone: '+2348031112222', email: 'new@example.com', pin: '739152' });
    expectCleared();
    expect(session.biometricOn()).toBe(false);
    session.completeSignUp({ phone: '+2348031113333', email: 'n2@example.com', pin: '739152' }, { biometric: true });
    expect(session.biometricOn()).toBe(true);
  });

  it('biometric log-in is bound to the account it was turned on for', () => {
    expect(session.logIn(DEMO_ACCOUNT.phone, DEMO_ACCOUNT.pin, NOW, false)).toEqual({ ok: true });
    session.setBiometric(true);
    expect(session.logInWithBiometrics(NOW)).toBe(true);
    session.completeSignUp({ phone: '+2348031112222', email: 'new@example.com', pin: '739152' });
    session.logOut();
    expect(session.logInWithBiometrics(NOW)).toBe(false);
  });
});

describe('QA-01: a verified phone or email change is what log-in uses', () => {
  it('phone: the old number stops working, the new one works', () => {
    profileStore.confirmPhone('+2348031112222');
    expect(session.logIn(DEMO_ACCOUNT.phone, DEMO_ACCOUNT.pin, NOW, false)).toMatchObject({ ok: false, reason: 'wrong' });
    expect(session.logIn('+2348031112222', DEMO_ACCOUNT.pin, NOW, false)).toEqual({ ok: true });
  });

  it('email: the old address stops working, the new one works', () => {
    profileStore.confirmEmail('david.new@example.com');
    expect(session.logIn(DEMO_ACCOUNT.email, DEMO_ACCOUNT.pin, NOW, false)).toMatchObject({ ok: false, reason: 'wrong' });
    expect(session.logIn('david.new@example.com', DEMO_ACCOUNT.pin, NOW, false)).toEqual({ ok: true });
  });

  it('Face ID stays with the account when its phone changes', () => {
    session.setBiometric(true);
    profileStore.confirmPhone('+2348031112222');
    expect(session.biometricOn()).toBe(true);
  });
});

describe('QA-03 / SEC-10: a TOTP code works once (RFC 6238 §5.2)', () => {
  it('refuses the same code twice and counts the replay as a wrong attempt', () => {
    const secret = enrol();
    const code = totp(base32Decode(secret), NOW);
    expect(twoFactor.verify(code, NOW).ok).toBe(true);
    expect(twoFactor.verify(code, NOW + 1000)).toMatchObject({ ok: false, reason: 'wrong', attemptsLeft: MAX_ATTEMPTS - 1 });
  });

  it('refuses an older step after a newer one was used', () => {
    const secret = enrol(NOW - 90_000);
    expect(twoFactor.verify(totp(base32Decode(secret), NOW), NOW).ok).toBe(true);
    expect(twoFactor.verify(totp(base32Decode(secret), NOW - 30_000), NOW).ok).toBe(false);
  });

  it('the enrolment code cannot be reused for a step-up', () => {
    const secret = twoFactor.beginEnrolment(rnd);
    const code = totp(base32Decode(secret), NOW);
    expect(twoFactor.confirmEnrolment(code, NOW, rnd)).not.toBeNull();
    expect(twoFactor.verify(code, NOW).ok).toBe(false);
  });

  it('accepts ±1 step but not ±2', () => {
    const secret = enrol(NOW - 120_000);
    const key = base32Decode(secret);
    expect(twoFactor.verify(totp(key, NOW + 60_000), NOW).ok).toBe(false);
    expect(twoFactor.verify(totp(key, NOW + 30_000), NOW).ok).toBe(true);
  });

  it('a spaced code ("123 456") is read as digits', () => {
    const secret = enrol();
    const code = totp(base32Decode(secret), NOW);
    expect(twoFactor.verify(`${code.slice(0, 3)} ${code.slice(3)}`, NOW).ok).toBe(true);
  });

  it('lock boundary: locked 1 ms before it ends, open at the end', () => {
    const secret = enrol();
    for (let i = 0; i < MAX_ATTEMPTS; i++) twoFactor.verify('000000', NOW);
    const key = base32Decode(secret);
    expect(twoFactor.verify(totp(key, NOW + LOCK_MS - 1), NOW + LOCK_MS - 1)).toMatchObject({ reason: 'locked' });
    expect(twoFactor.verify(totp(key, NOW + LOCK_MS), NOW + LOCK_MS).ok).toBe(true);
  });
});

describe('QA-04: enrolment cannot replace the secret or clear a lock', () => {
  it('confirmEnrolment is refused once enrolled', () => {
    const secret = enrol();
    for (let i = 0; i < MAX_ATTEMPTS; i++) twoFactor.verify('000000', NOW);
    const until = twoFactor.get().lockedUntil;
    const other = twoFactor.beginEnrolment(rnd);
    expect(twoFactor.confirmEnrolment(totp(base32Decode(other), NOW), NOW, rnd)).toBeNull();
    expect(twoFactor.get().authenticatorSecret).toBe(secret);
    expect(twoFactor.get().lockedUntil).toBe(until);
  });
});

describe('FIN-07 / FIN-17 / QA-05 / FIN-06: strict amount parsing and no overflow crash', () => {
  it.each([
    ['799', 79900],
    ['1,644.5', 164450],
    ['1,234,567.89', 123456789],
    [' 5 ', 500],
  ])('parses %p', (input, expected) => expect(parseToHundredths(input)).toBe(expected));

  it.each(['1,50', '1,5', '12,34', '1 0', '1 000', '1,2,3', ',100', '1e3', '0x10', '-5', '1.234', '١٢', ''])(
    'refuses %p',
    (input) => expect(parseToHundredths(input)).toBeNull(),
  );

  it.each([
    ['12', 12],
    ['1e3', null],
    ['0x10', null],
    [' 5 ', null],
    ['-1', null],
    ['0', null],
    ['007', null],
    ['', null],
    [undefined, null],
    ['9007199254740993', null],
  ])('route param %p', (input, expected) => expect(parsePositiveInt(input)).toBe(expected));

  it('half to even at exactly .5 (FIN-01 decision), and negatives are refused', () => {
    expect(quoteMinor(1, 500)).toBe(0); // 0.5 → 0
    expect(quoteMinor(3, 500)).toBe(2); // 1.5 → 2
    expect(quoteMinor(5, 500)).toBe(2); // 2.5 → 2
    expect(quoteMinor(1, 1500)).toBe(2); // 1.5 → 2
    expect(quoteMinor(1, 510)).toBe(1); // above half rounds up
    expect(quoteMinor(1, 490)).toBe(0);
    expect(quoteMinor(1, 1892500)).toBe(1892); // the reviewer's example: 1892.5 → 1892
    expect(() => quoteMinor(-150, 100)).toThrow();
  });

  it('an out-of-range quote is null, not a thrown render error', () => {
    expect(quoteMinorOrNull(Number.MAX_SAFE_INTEGER, 1893000)).toBeNull();
    expect(quoteMinorOrNull(20000, 1893000)).toBe(37860000);
  });
});

describe('QA-07: ABA routing numbers', () => {
  it.each([
    ['021000021', true], // valid checksum, prefix 02
    ['000000000', false],
    ['130000004', false], // prefix 13 is not assigned
    ['12345678', false],
  ])('%p → %p', (v, ok) => expect(isValidRoutingNumber(v)).toBe(ok));
});

describe('SEC-05 / QA-06: support chat blocks secrets in any form, not amounts', () => {
  it.each([
    'my pin 482613',
    'pin: 482613',
    '482613 is my pin',
    'my password is hunter2',
    'ab3k-7xyz',
    'AB3K7XYZ',
    'AB3K 7XYZ',
    'abcd-efgh',
    '123 456',
    '1 2 3 4 5 6',
    'my code 123456',
    'JBSW Y3DP EHPK 3PXP',
    'JBSWY3DPEHPK3PXP',
    '１２３４５６',
    '0123456789',
  ])('blocks %p', (m) => expect(sensitiveWarning(m)).not.toBeNull());

  it.each([
    'what is a PIN?',
    'how do I reset my password please',
    'can I trade 150000 naira',
    '₦150000 please',
    'send 200000 USD',
    'I want to TRANSFER money',
    'this will make sure it works',
  ])('allows %p', (m) => expect(sensitiveWarning(m)).toBeNull());
});

describe('trade integrity', () => {
  const make = (amountMinor = 20000) =>
    tradeStore.create({ side: 'buy', listing: offer, amountMinor, payout: PAYOUT, now: NOW, random: rnd });

  it('FIN-05: a listing cannot be taken twice; an ended trade frees its share', () => {
    const t = make(20000);
    expect(tradeStore.remainingMinor(offer)).toBe(0);
    expect(() => make(1)).toThrow();
    tradeStore.cancel(t.id, NOW + 1);
    expect(tradeStore.remainingMinor(offer)).toBe(20000);
    expect(make(20000).amountMinor).toBe(20000);
  });

  it('FIN-08: a request made before the deadline holds expiry until answered', () => {
    const t = make();
    const deadline = t.deadline;
    expect(tradeStore.requestExtension(t.id, deadline - 1000)).toBe(true);
    tradeStore.tick(t.id, deadline + 1);
    expect(tradeStore.get(t.id)?.phase).toBe('awaiting_payment');
    tradeStore.tick(t.id, deadline - 1000 + DEMO_STEP_MS);
    expect(tradeStore.get(t.id)).toMatchObject({ extension: 'approved', phase: 'awaiting_payment' });
  });

  it('QA-14: paying ends a pending extension request', () => {
    const t = make();
    tradeStore.requestExtension(t.id, NOW + 1000);
    tradeStore.markPaid(t.id, NOW + 2000);
    expect(tradeStore.get(t.id)?.extension).toBe('none');
  });

  it('FIN-12: cannot cancel after the deadline (it expires instead)', () => {
    const t = make();
    expect(tradeStore.cancel(t.id, NOW + FUNDING_WINDOW_MS + 1)).toBe(false);
    tradeStore.tick(t.id, NOW + FUNDING_WINDOW_MS + 1);
    expect(tradeStore.get(t.id)?.phase).toBe('expired');
  });

  it('QA-11: only a completed trade can be rated, and only once', () => {
    const t = make();
    expect(tradeStore.rate(t.id, 5, '')).toBe(false);
    tradeStore.markPaid(t.id, NOW);
    for (let i = 1; i <= 3; i++) tradeStore.tick(t.id, NOW + i * DEMO_STEP_MS);
    expect(tradeStore.rate(t.id, 4, 'good')).toBe(true);
    expect(tradeStore.rate(t.id, 1, 'changed')).toBe(false);
    expect(tradeStore.get(t.id)?.rating?.stars).toBe(4);
    expect(tradeStore.rate('unknown', 5, '')).toBe(false);
  });
});

describe('receipts show what was recorded, worded by status', () => {
  it('FIN-03: a failed trade never says "Amount Paid" or "Amount Received"', async () => {
    const t = tradeStore.create({ side: 'buy', listing: offer, amountMinor: 20000, payout: PAYOUT, now: NOW, random: rnd });
    tradeStore.tick(t.id, NOW + FUNDING_WINDOW_MS + 1);
    await render(<ReceiptScreen item={toHistoryItem(tradeStore.get(t.id)!)} onClose={jest.fn()} />);
    expect(screen.queryByText('Amount Paid')).toBeNull();
    expect(screen.queryByText('Amount Received')).toBeNull();
    expect(screen.getByText('Amount (not paid)')).toBeTruthy();
  });

  it('FIN-02: "Amount Paid" is the recorded transfer, not a recomputed one', async () => {
    const item: HistoryItem = {
      ...toHistoryItem(tradeStore.create({ side: 'buy', listing: offer, amountMinor: 20000, payout: PAYOUT, now: NOW, random: rnd })),
      status: 'completed',
      recorded: { transferMinor: 37893750, payCurrency: 'NGN', feeMinor: 33750 }, // e.g. a recorded fee that differs from today's
    };
    await render(<ReceiptScreen item={item} onClose={jest.fn()} />);
    expect(screen.getByText('378,937.50 NGN')).toBeTruthy();
    expect(screen.getByText('337.50 NGN')).toBeTruthy();
  });
});

describe('SEC-06 / QA-08: sign-up codes are never reissued without a throttled resend', () => {
  it('after 5 wrong tries, Verify is off and no new code appears until Resend after 60 s', async () => {
    jest.useFakeTimers();
    let t = NOW;
    const onVerified = jest.fn();
    await render(
      <CodeScreen testID="c" kind="phone" target="+2348031112222" title="t" body="b" verifyLabel="Verify" onBack={jest.fn()} onVerified={onVerified} random={rnd} now={() => t} />,
    );
    const firstNote = String(screen.getByTestId('c-demo').props.children);
    for (let i = 0; i < 5; i++) {
      await fireEvent.changeText(screen.getByTestId('c-code'), '000000');
      await fireEvent.press(screen.getByTestId('c-verify'));
    }
    expect(screen.getByTestId('c-error').props.children).toMatch(/Ask for a new code/);
    expect(String(screen.getByTestId('c-demo').props.children)).toBe(firstNote); // no silent new code
    await fireEvent.press(screen.getByTestId('c-resend')); // too early: ignored
    expect(String(screen.getByTestId('c-demo').props.children)).toBe(firstNote);
    t = NOW + RESEND_AFTER_MS;
    await act(async () => {
      jest.advanceTimersByTime(1000); // the countdown ticker re-renders the button
    });
    await fireEvent.press(screen.getByTestId('c-resend'));
    expect(String(screen.getByTestId('c-demo').props.children)).not.toBe(firstNote);
    expect(onVerified).not.toHaveBeenCalled();
  });
});

describe('SEC-04: secrets copied to the clipboard are cleared', () => {
  function fakeClipboard(): { value: string; setStringAsync: (v: string) => Promise<boolean>; getStringAsync: () => Promise<string> } {
    const c = {
      value: '',
      setStringAsync: async (v: string) => ((c.value = v), true),
      getStringAsync: async () => c.value,
    };
    return c;
  }

  it('clears after a minute if still there', async () => {
    const c = fakeClipboard();
    let later: (() => void) | null = null;
    await copySensitive('SECRET', c, (fn, ms) => {
      expect(ms).toBe(CLEAR_AFTER_MS);
      later = fn;
    });
    expect(c.value).toBe('SECRET');
    (later as unknown as () => void)();
    await act(async () => undefined);
    expect(c.value).toBe('');
  });

  it('leaves something the user copied since', async () => {
    const c = fakeClipboard();
    let later: (() => void) | null = null;
    await copySensitive('SECRET', c, (fn) => {
      later = fn;
    });
    await c.setStringAsync('my note');
    (later as unknown as () => void)();
    await act(async () => undefined);
    expect(c.value).toBe('my note');
  });
});
