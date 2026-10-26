/**
 * ADR-058: the user's tier and trade limits (server builds). The server enforces them; the
 * screen shows its numbers and never a balance.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../src/api/client';
import type { LimitsView } from '../src/api/limitsApi';
import { MyLimitsScreen, TIERS } from '../src/features/profile/MyLimitsScreen';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

const tier1: LimitsView = {
  tier: 1, daily_limit: '500000.00', monthly_limit: '2000000.00', used_today: '396150.00',
  used_this_month: '396150.00', left_today: '103850.00', left_this_month: '1603850.00',
};

it('lists the owner-confirmed tiers', () => {
  expect(TIERS.map((t) => [t.level, t.daily, t.monthly])).toEqual([
    [0, null, null], [1, '500,000', '2,000,000'], [2, '5,000,000', '20,000,000'], [3, '20,000,000', '100,000,000'],
  ]);
});

it('shows what is left today and this month', async () => {
  await render(<MyLimitsScreen source={{ get: jest.fn(async () => tier1) }} onBack={jest.fn()} onVerifyIdentity={jest.fn()} />);
  await flush();
  expect(screen.getByText('You are on Tier 1')).toBeTruthy();
  expect(screen.getByTestId('limits-left-today').props.children).toBe('NGN 103,850.00');
  expect(screen.getByTestId('limits-left-month').props.children).toBe('NGN 1,603,850.00');
  expect(screen.getByText('NGN 396,150.00 / NGN 500,000.00')).toBeTruthy();
  expect(screen.queryByTestId('limits-verify')).toBeNull();
});

it('Tier 0 can look and is asked to verify', async () => {
  const onVerify = jest.fn();
  const tier0: LimitsView = { ...tier1, tier: 0, daily_limit: null, monthly_limit: null, used_today: '0.00', used_this_month: '0.00', left_today: '0.00', left_this_month: '0.00' };
  await render(<MyLimitsScreen source={{ get: jest.fn(async () => tier0) }} onBack={jest.fn()} onVerifyIdentity={onVerify} />);
  await flush();
  expect(screen.getByText('You can look at the market. Verify your identity to start trading.')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('limits-verify'));
  expect(onVerify).toHaveBeenCalled();
});

it('shows a load error and retries', async () => {
  const get = jest.fn().mockRejectedValueOnce(new ApiError('HTTP_500', 500, 'Something went wrong.')).mockResolvedValue(tier1);
  await render(<MyLimitsScreen source={{ get }} onBack={jest.fn()} onVerifyIdentity={jest.fn()} />);
  await flush();
  expect(screen.getByText('Something went wrong.')).toBeTruthy();
});

it('writes the limit refusal with the amount left, in the user’s language', () => {
  const { messageFor } = jest.requireActual('../src/api/client');
  const daily = new ApiError('TRADE_403_DAILY_LIMIT', 403, 'English text', null, { left: '103850.00' });
  expect(messageFor(daily)).toBe('This deal is over your daily limit. You can trade up to NGN 103,850.00 more today.');
  const monthly = new ApiError('TRADE_403_MONTHLY_LIMIT', 403, 'English text', null, { left: '19250.00' });
  expect(messageFor(monthly)).toBe('This deal is over your monthly limit. You can trade up to NGN 19,250.00 more this month.');
  const junk = new ApiError('TRADE_403_DAILY_LIMIT', 403, 'Fallback text', null, { left: '<b>' });
  expect(messageFor(junk)).toBe('Fallback text');
});
