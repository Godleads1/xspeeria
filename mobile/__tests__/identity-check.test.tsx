/**
 * ADR-040: the identity check screen (server builds). The server is a fake `KycSource`; the
 * Didit rules are tested on the server (ADR-039).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../src/api/client';
import type { ServerKycCase } from '../src/api/kycApi';
import { IdentityCheckScreen, INTRO, kycCopy } from '../src/features/kyc/IdentityCheckScreen';
import { safeVerificationUrl, type KycSource } from '../src/features/kyc/serverKyc';

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

const kase = (over: Partial<ServerKycCase> = {}): ServerKycCase => ({
  kyc_case_id: null,
  status: 'not_started',
  message: 'Verify your identity to trade.',
  verification_url: null,
  legal_name: null,
  ...over,
});

function fake(first: ServerKycCase = kase(), started?: ServerKycCase): jest.Mocked<KycSource> {
  return {
    current: jest.fn(async () => first),
    start: jest.fn(async () =>
      started ?? kase({ kyc_case_id: 'k1', status: 'pending_documents', verification_url: 'https://verify.didit.me/s/abc' }),
    ),
    open: jest.fn(async (_url: string) => undefined),
  };
}

describe('identity check wording', () => {
  it('has a headline and action for every status', () => {
    const statuses = ['not_started', 'pending_documents', 'under_review', 'approved', 'rejected', 'expired'] as const;
    for (const s of statuses) {
      const c = kycCopy(kase({ status: s }));
      expect(c.title.length).toBeGreaterThan(0);
      expect(`${c.title} ${c.chip}`).not.toMatch(/sanction|wallet|balance/i);
    }
    expect(kycCopy(kase({ status: 'approved' })).action).toBeNull();
    expect(kycCopy(kase({ status: 'under_review' })).action).toBeNull();
    expect(kycCopy(kase({ status: 'rejected' })).action).toBe('Try again');
  });

  it('opens only https links', () => {
    expect(safeVerificationUrl('https://verify.didit.me/s/abc')).toBe('https://verify.didit.me/s/abc');
    expect(safeVerificationUrl('http://verify.didit.me/s/abc')).toBeNull();
    expect(safeVerificationUrl('javascript:alert(1)')).toBeNull();
    expect(safeVerificationUrl('not a url')).toBeNull();
    expect(safeVerificationUrl(null)).toBeNull();
  });
});

describe('Identity check screen', () => {
  it('explains the check, then opens Didit', async () => {
    const src = fake();
    await render(<IdentityCheckScreen source={src} onBack={jest.fn()} pollMs={60_000} />);
    await flush();
    expect(screen.getByText(INTRO)).toBeTruthy();
    expect(screen.getByText('• You must be 18 or older')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('identity-start'));
    await flush();
    expect(src.start).toHaveBeenCalled();
    expect(src.open).toHaveBeenCalledWith('https://verify.didit.me/s/abc');
    expect(screen.getByTestId('identity-start')).toHaveTextContent('Continue verification');
  });

  it('never opens an unsafe link from the server', async () => {
    const src = fake(kase(), kase({ status: 'pending_documents', verification_url: 'http://evil.example' }));
    await render(<IdentityCheckScreen source={src} onBack={jest.fn()} pollMs={60_000} />);
    await flush();
    await fireEvent.press(screen.getByTestId('identity-start'));
    await flush();
    expect(src.open).not.toHaveBeenCalled();
    expect(screen.getByTestId('identity-error')).toHaveTextContent(/Something went wrong/);
  });

  it('shows the verified name and a way to the market', async () => {
    const onVerified = jest.fn();
    const src = fake(kase({ status: 'approved', message: 'Verified.', legal_name: 'Ada Obi', kyc_case_id: 'k1' }));
    await render(<IdentityCheckScreen source={src} onBack={jest.fn()} onVerified={onVerified} pollMs={60_000} />);
    await flush();
    expect(screen.getByTestId('identity-name')).toHaveTextContent('Name on your ID: Ada Obi');
    expect(screen.queryByTestId('identity-start')).toBeNull();
    await fireEvent.press(screen.getByTestId('identity-done'));
    expect(onVerified).toHaveBeenCalled();
  });

  it('shows the server reason when not verified, and lets the user try again', async () => {
    const reason = 'You must be 18 or older to use Xspeeria.';
    await render(
      <IdentityCheckScreen source={fake(kase({ status: 'rejected', message: reason }))} onBack={jest.fn()} pollMs={60_000} />,
    );
    await flush();
    expect(screen.getByTestId('identity-message')).toHaveTextContent(reason);
    expect(screen.getByTestId('identity-start')).toHaveTextContent('Try again');
  });

  it('shows a clear error when checks are switched off', async () => {
    const src = fake();
    src.start.mockRejectedValueOnce(new ApiError('SYS_503_SERVICE_UNAVAILABLE', 503, 'x'));
    await render(<IdentityCheckScreen source={src} onBack={jest.fn()} pollMs={60_000} />);
    await flush();
    await fireEvent.press(screen.getByTestId('identity-start'));
    await flush();
    expect(screen.getByTestId('identity-error')).toHaveTextContent(/isn’t available right now/);
  });

  it('keeps checking while a check is under way', async () => {
    jest.useFakeTimers();
    try {
      const src = fake(kase({ status: 'under_review', message: 'Being reviewed.' }));
      await render(<IdentityCheckScreen source={src} onBack={jest.fn()} pollMs={5_000} />);
      await flush();
      expect(src.current).toHaveBeenCalledTimes(1);
      await act(async () => {
        jest.advanceTimersByTime(5_000);
      });
      expect(src.current).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not keep checking when nothing is under way', async () => {
    jest.useFakeTimers();
    try {
      const src = fake();
      await render(<IdentityCheckScreen source={src} onBack={jest.fn()} pollMs={5_000} />);
      await flush();
      await act(async () => {
        jest.advanceTimersByTime(15_000);
      });
      expect(src.current).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
