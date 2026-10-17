import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { ReferralScreen } from '../src/features/referral/ReferralScreen';
import { REFERRAL, inviteMessage, referralDiscountMinor } from '../src/features/referral/data';

describe('referral reward (ADR-009)', () => {
  it('is 10% of the fee in integer minor units, half-up', () => {
    expect(referralDiscountMinor(37500)).toBe(3750);
    expect(referralDiscountMinor(37505)).toBe(3751);
    expect(referralDiscountMinor(37504)).toBe(3750);
    expect(referralDiscountMinor(0)).toBe(0);
    expect(() => referralDiscountMinor(1.5)).toThrow();
  });

  it('invite text promises a fee discount only', () => {
    const msg = inviteMessage('ABC');
    expect(msg).toMatch(/10% off the coordination fee/);
    expect(msg).not.toMatch(/bonus|earn|cash|balance|\$|₦|£/i);
  });
});

describe('Referral screen', () => {
  it('renders the Figma content with a count instead of earnings', async () => {
    await render(<ReferralScreen onBack={jest.fn()} />);
    expect(screen.getByText('Refer a friend, get 10% off!')).toBeTruthy();
    expect(screen.getByText(/10% off the coordination fee/)).toBeTruthy();
    expect(screen.getByTestId('referral-code').props.children).toBe(REFERRAL.code);
    expect(screen.getByText('Friends joined')).toBeTruthy();
    expect(screen.queryByText(/earnings|\$0/i)).toBeNull();
    expect(screen.getByTestId('referral-art', { includeHiddenElements: true })).toBeTruthy();
  });

  it('copies the code and shares the invite', async () => {
    const share = jest.fn(async () => undefined);
    await render(<ReferralScreen onBack={jest.fn()} share={share} code="ZZ11" />);
    await fireEvent.press(screen.getByTestId('referral-copy'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('ZZ11');
    await fireEvent.press(screen.getByTestId('referral-invite'));
    expect(share).toHaveBeenCalledWith(inviteMessage('ZZ11'));
  });
});
