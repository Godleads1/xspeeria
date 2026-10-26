/**
 * ADR-058: going up to Tier 2 (BVN and address) and Tier 3 (proof of address and source of
 * funds). The server and Didit decide; these test the screen's part.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../src/api/client';
import type { TierChecksView } from '../src/api/limitsApi';
import { UpgradeTierScreen, type UpgradeSource } from '../src/features/profile/UpgradeTierScreen';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

const tier1: TierChecksView = { tier: 1, bvn: null, address: null, proof_of_address: null, source_of_funds: null };
const tier2: TierChecksView = { tier: 2, bvn: 'approved', address: { line1: '12 Allen Avenue', city: 'Ikeja', state: 'Lagos', country: 'NG' }, proof_of_address: null, source_of_funds: null };

function src(first: TierChecksView, over: Partial<UpgradeSource> = {}): UpgradeSource {
  return {
    get: jest.fn(async () => first),
    bvn: jest.fn(async () => ({ ...first, bvn: 'approved' as const })),
    address: jest.fn(async () => tier2),
    proofOfAddress: jest.fn(async () => ({ ...tier2, proof_of_address: 'approved' as const })),
    sourceOfFunds: jest.fn(async () => ({ ...tier2, tier: 3, proof_of_address: 'approved' as const, source_of_funds: 'salary' })),
    pickDocument: jest.fn(async () => ({ base64: 'AAAA', contentType: 'image/jpeg' })),
    ...over,
  };
}

it('checks an 11-digit BVN once and clears it from the screen', async () => {
  const s = src(tier1);
  await render(<UpgradeTierScreen source={s} onBack={jest.fn()} />);
  await flush();
  await fireEvent.changeText(screen.getByTestId('upgrade-bvn'), '222-333 444 55abc');
  expect(screen.getByTestId('upgrade-bvn').props.value).toBe('22233344455');
  expect(screen.getByTestId('upgrade-bvn').props.secureTextEntry).toBe(true);
  await fireEvent.press(screen.getByTestId('upgrade-bvn-submit'));
  await flush();
  expect(s.bvn).toHaveBeenCalledWith('22233344455');
  expect(screen.getByTestId('upgrade-bvn-done')).toBeTruthy();
});

it('does not send a short BVN', async () => {
  const s = src(tier1);
  await render(<UpgradeTierScreen source={s} onBack={jest.fn()} />);
  await flush();
  await fireEvent.changeText(screen.getByTestId('upgrade-bvn'), '1234');
  await fireEvent.press(screen.getByTestId('upgrade-bvn-submit'));
  expect(s.bvn).not.toHaveBeenCalled();
});

it('saves the home address and moves to Tier 2', async () => {
  const s = src(tier1);
  await render(<UpgradeTierScreen source={s} onBack={jest.fn()} />);
  await flush();
  await fireEvent.changeText(screen.getByTestId('upgrade-line1'), ' 12 Allen Avenue ');
  await fireEvent.changeText(screen.getByTestId('upgrade-city'), 'Ikeja');
  await fireEvent.changeText(screen.getByTestId('upgrade-state'), 'Lagos');
  await fireEvent.press(screen.getByTestId('upgrade-address-submit'));
  await flush();
  expect(s.address).toHaveBeenCalledWith(expect.objectContaining({ line1: '12 Allen Avenue', city: 'Ikeja', state: 'Lagos', country: 'NG' }));
  expect(screen.getByTestId('upgrade-tier').props.children).toBe('You are on Tier 2');
});

it('Tier 3 is locked until Tier 2', async () => {
  await render(<UpgradeTierScreen source={src(tier1)} onBack={jest.fn()} />);
  await flush();
  expect(screen.getByText('Finish Tier 2 first.')).toBeTruthy();
  expect(screen.queryByTestId('upgrade-poa-submit')).toBeNull();
});

it('uploads a proof of address and answers the source of funds', async () => {
  const s = src(tier2);
  await render(<UpgradeTierScreen source={s} onBack={jest.fn()} />);
  await flush();
  await fireEvent.press(screen.getByTestId('upgrade-poa-submit'));
  await flush();
  expect(s.proofOfAddress).toHaveBeenCalledWith({ base64: 'AAAA', contentType: 'image/jpeg' });
  await fireEvent.press(screen.getByTestId('upgrade-sof-salary'));
  await flush();
  expect(s.sourceOfFunds).toHaveBeenCalledWith('salary', undefined);
  expect(screen.getByTestId('upgrade-tier').props.children).toBe('You are on Tier 3');
});

it('a cancelled photo sends nothing; a refusal is shown', async () => {
  const s = src(tier2, {
    pickDocument: jest.fn(async () => null),
    sourceOfFunds: jest.fn(async () => { throw new ApiError('AUTH_429_RATE_LIMITED', 429, 'You have tried this 3 times today. Please try again tomorrow.'); }),
  });
  await render(<UpgradeTierScreen source={s} onBack={jest.fn()} />);
  await flush();
  await fireEvent.press(screen.getByTestId('upgrade-poa-submit'));
  await flush();
  expect(s.proofOfAddress).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('upgrade-sof-other'));
  await flush();
  expect(screen.getByTestId('upgrade-error').props.children).toMatch(/3 times today/);
});
