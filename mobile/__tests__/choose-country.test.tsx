/** ADR-071: choosing which country to verify (built on ADR-042's per-country checks). */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { ServerRegions } from '../src/api/kycApi';
import { ChooseCountryScreen } from '../src/features/kyc/ChooseCountryScreen';
import { AccountDetailsScreen } from '../src/features/profile/AccountDetailsScreen';

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

const REGIONS: ServerRegions = {
  regions: [
    { country: 'NG', status: 'approved' },
    { country: 'GB', status: 'under_review' },
  ],
  suggested_country: null,
};

describe('choose a country to verify', () => {
  it('lists all three countries with their status from the server', async () => {
    await render(<ChooseCountryScreen source={{ get: async () => REGIONS }} onBack={jest.fn()} onChoose={jest.fn()} />);
    await flush();
    expect(screen.getByText('Which country will you pay from?')).toBeTruthy();
    expect(screen.getByLabelText('Nigeria, pay in NGN: Verified')).toBeTruthy();
    expect(screen.getByLabelText('United Kingdom, pay in GBP: In review')).toBeTruthy();
    // Not on the server's list: not verified.
    expect(screen.getByLabelText('United States, pay in USD: Not verified')).toBeTruthy();
    expect(screen.getByText('You can pay in NGN')).toBeTruthy();
    expect(screen.getByText('Needed to pay in USD')).toBeTruthy();
  });

  it('ADR-105: shows Germany and France; China only when the server lists it', async () => {
    await render(<ChooseCountryScreen source={{ get: async () => REGIONS }} onBack={jest.fn()} onChoose={jest.fn()} />);
    await flush();
    expect(screen.getByLabelText('Germany, pay in EUR: Not verified')).toBeTruthy();
    expect(screen.getByLabelText('France, pay in EUR: Not verified')).toBeTruthy();
    expect(screen.queryByTestId('country-CN')).toBeNull();
    const withChina: ServerRegions = { ...REGIONS, regions: [...REGIONS.regions, { country: 'CN', status: 'not_started' }] };
    await render(<ChooseCountryScreen source={{ get: async () => withChina }} onBack={jest.fn()} onChoose={jest.fn()} />);
    await flush();
    expect(screen.getByLabelText('China, pay in CNY: Not verified')).toBeTruthy();
  });

  it('opens the chosen country’s check', async () => {
    const onChoose = jest.fn();
    await render(<ChooseCountryScreen source={{ get: async () => REGIONS }} onBack={jest.fn()} onChoose={onChoose} />);
    await flush();
    await fireEvent.press(screen.getByTestId('country-US'));
    expect(onChoose).toHaveBeenCalledWith('US');
    await fireEvent.press(screen.getByTestId('country-NG'));
    expect(onChoose).toHaveBeenLastCalledWith('NG');
  });

  it('shows an error with retry, and never invents a status', async () => {
    const get = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(REGIONS);
    await render(<ChooseCountryScreen source={{ get }} onBack={jest.fn()} onChoose={jest.fn()} />);
    await flush();
    expect(screen.queryByTestId('country-NG')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /try again/i }));
    await flush();
    expect(get).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('country-NG')).toBeTruthy();
  });
});

describe('Account details', () => {
  it('offers to verify another country in server builds', async () => {
    const onVerify = jest.fn();
    await render(
      <AccountDetailsScreen
        onBack={jest.fn()}
        serverRegions={[{ flag: 'NGN', name: 'Nigeria', state: 'approved' }]}
        onVerifyAnotherCountry={onVerify}
      />,
    );
    await fireEvent.press(screen.getByTestId('verify-another-country'));
    expect(onVerify).toHaveBeenCalled();
    expect(screen.getByText('Verify another country')).toBeTruthy();
  });

  it('says "Verify your identity" when nothing is verified yet, and hides the link in the demo', async () => {
    const view = await render(<AccountDetailsScreen onBack={jest.fn()} serverRegions={[]} onVerifyAnotherCountry={jest.fn()} />);
    expect(screen.getByTestId('verify-another-country')).toHaveTextContent('Verify your identity');
    view.unmount();
    await render(<AccountDetailsScreen onBack={jest.fn()} />);
    expect(screen.queryByTestId('verify-another-country')).toBeNull();
  });
});
