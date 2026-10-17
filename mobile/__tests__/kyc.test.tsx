import { fireEvent, render, screen } from '@testing-library/react-native';

import { KycLimitsScreen } from '../src/features/profile/KycLimitsScreen';
import { KYC_TIERS, groupThousands } from '../src/features/profile/data';

describe('KYC tiers data', () => {
  it('stores limits as whole-naira integers', () => {
    for (const t of KYC_TIERS) expect(Number.isSafeInteger(t.monthlyLimitNaira)).toBe(true);
  });

  it('groups thousands without floats', () => {
    expect(groupThousands(50000)).toBe('50,000');
    expect(groupThousands(1234567)).toBe('1,234,567');
    expect(groupThousands(0)).toBe('0');
    expect(() => groupThousands(1.5)).toThrow();
    expect(() => groupThousands(-1)).toThrow();
  });
});

describe('KYC and limits screen', () => {
  it('renders the Figma tiers with the current level pill', async () => {
    await render(<KycLimitsScreen onBack={jest.fn()} />);
    expect(screen.getByText('KYC and limits')).toBeTruthy();
    for (const n of [1, 2, 3]) expect(screen.getByText(`Tier ${n}`)).toBeTruthy();
    expect(screen.getByText(/^Limit: 50,000 Naira per month$/)).toBeTruthy();
    expect(screen.getByTestId('kyc-tier-1-current')).toBeTruthy();
    expect(screen.queryByTestId('kyc-tier-1-upgrade')).toBeNull();
    expect(screen.getAllByText('Upgrade')).toHaveLength(2);
  });

  it('offers Upgrade only above the current tier', async () => {
    const onUpgrade = jest.fn();
    await render(<KycLimitsScreen onBack={jest.fn()} onUpgrade={onUpgrade} currentTier={2} />);
    expect(screen.queryByTestId('kyc-tier-1-upgrade')).toBeNull();
    expect(screen.queryByTestId('kyc-tier-2-upgrade')).toBeNull();
    expect(screen.getByTestId('kyc-tier-2-current')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('kyc-tier-3-upgrade'));
    expect(onUpgrade).toHaveBeenCalledWith(expect.objectContaining({ level: 3 }));
  });

  it('goes back', async () => {
    const onBack = jest.fn();
    await render(<KycLimitsScreen onBack={onBack} />);
    await fireEvent.press(screen.getByTestId('kyc-back'));
    expect(onBack).toHaveBeenCalled();
  });
});
