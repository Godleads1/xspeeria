/**
 * Regressions for bugs seen on a phone, 2026-10-17.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { MarketScreen } from '../src/features/market/MarketScreen';
import { AuthenticatorSetupScreen } from '../src/features/security/AuthenticatorSetupScreen';
import { StepUpHost } from '../src/features/security/StepUpHost';
import { twoFactor } from '../src/features/security/twoFactorStore';

const rnd = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);

beforeEach(() => twoFactor.reset());

it('opening 2FA setup does not update StepUpHost while rendering', async () => {
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  // As in the app: the step-up host is already mounted (and listening) when setup opens.
  const view = await render(<StepUpHost onSetUp={jest.fn()} />);
  await view.rerender(
    <>
      <StepUpHost onSetUp={jest.fn()} />
      <AuthenticatorSetupScreen account="d@example.com" random={rnd} onBack={jest.fn()} onDone={jest.fn()} />
    </>,
  );
  expect(twoFactor.get().pendingSecret).not.toBeNull();
  expect(screen.getByTestId('authenticator-qr')).toBeTruthy();
  const renderWarnings = errors.mock.calls.filter((c) => String(c[0]).includes('Cannot update a component'));
  expect(renderWarnings).toEqual([]);
  errors.mockRestore();
});

it('a listing on the Market tab opens the trade flow, not a placeholder message', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const onTake = jest.fn();
  await render(<MarketScreen onCreate={jest.fn()} onTakeListing={onTake} />);
  await fireEvent.press(screen.getByTestId('market-currency'));
  await fireEvent.press(screen.getByTestId('currency-USD'));
  await fireEvent.press(screen.getAllByTestId('listing-o1-action')[0]);
  expect(onTake).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }), 'buy');
  expect(alert).not.toHaveBeenCalled();
  alert.mockRestore();
});
