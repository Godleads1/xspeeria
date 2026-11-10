/** ADR-107: eleven African countries in the app — countries, phones, bank and mobile-money forms. */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { COUNTRY_CURRENCY, KYC_COUNTRIES } from '../src/api/kycApi';
import { fullPhone, splitPhone } from '../src/features/auth/ui';
import { AddPayoutAccountScreen, toNewAccount } from '../src/features/payouts/AddPayoutAccountScreen';
import type { PayoutSource } from '../src/features/payouts/serverPayouts';
import { payoutKinds, validateBankForm } from '../src/features/profile/data';
import { normalisePhone } from '../src/features/profile/verification';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const fake = (): PayoutSource => ({ list: jest.fn(), add: jest.fn(), remove: jest.fn() }) as never;

describe('African countries (ADR-107)', () => {
  it('lists the eleven countries; Zimbabwe pays in US dollars', () => {
    for (const c of ['EG', 'ZA', 'MA', 'ET', 'KE', 'SN', 'GH', 'ZW', 'UG', 'ZM', 'TZ'] as const) {
      expect(KYC_COUNTRIES).toContain(c);
    }
    expect(COUNTRY_CURRENCY.ZW).toBe('USD');
    expect(COUNTRY_CURRENCY.SN).toBe('XOF');
  });

  it('reads and builds the new phone numbers', () => {
    expect(normalisePhone(fullPhone('KE', '0712 345678'))).toBe('+254712345678');
    expect(splitPhone('+212612345678')).toEqual({ country: 'MA', local: '612345678' });
    expect(splitPhone('+27821234567')).toEqual({ country: 'ZA', local: '821234567' });
    expect(splitPhone('+263771234567')).toEqual({ country: 'ZW', local: '771234567' });
  });

  it('offers a bank account everywhere and mobile money where it is common', () => {
    expect(payoutKinds('KES')).toEqual(['bank', 'mobile_money']);
    expect(payoutKinds('EGP')).toEqual(['bank']);
    expect(payoutKinds('USD')).toEqual(['standard', 'bank', 'mobile_money']);
    expect(payoutKinds('GBP')).toEqual(['standard']);
  });

  it('checks the forms and sends the right request', () => {
    expect(validateBankForm('KES', { bankName: 'Equity Bank', accountNumber: '0123456789012' }, 'bank')).toEqual({});
    expect(Object.keys(validateBankForm('KES', { bankName: 'Equity Bank', accountNumber: '12', branchCode: '0' }, 'bank')).sort()).toEqual([
      'accountNumber',
      'branchCode',
    ]);
    expect(validateBankForm('GHS', { bankName: 'MTN MoMo', accountNumber: '+233241234567' }, 'mobile_money')).toEqual({});
    expect(validateBankForm('GHS', { bankName: 'MTN MoMo', accountNumber: '+254712345678' }, 'mobile_money').accountNumber).toMatch(/\+233/);
    expect(toNewAccount('KES', { bankName: 'Equity Bank', accountNumber: '0123456789012', branchCode: '068' }, 'bank')).toEqual({
      currency: 'KES',
      bank_name: 'Equity Bank',
      account_number: '0123456789012',
      account_type: 'bank',
      branch_code: '068',
    });
    expect(toNewAccount('USD', { bankName: 'EcoCash', accountNumber: '+263771234567' }, 'mobile_money')).toEqual({
      currency: 'USD',
      bank_name: 'EcoCash',
      account_number: '+263771234567',
      account_type: 'mobile_money',
    });
  });

  it('the add-account screen switches between bank and mobile money', async () => {
    await render(<AddPayoutAccountScreen source={fake()} onBack={jest.fn()} onAdded={jest.fn()} confirmWith={jest.fn()} />);
    await act(async () => undefined);
    await fireEvent.press(screen.getByTestId('add-payout-currency-KES'));
    expect(screen.getByTestId('field-branchCode')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('add-payout-kind-mobile_money'));
    expect(screen.queryByTestId('field-branchCode')).toBeNull();
    expect(screen.getByText('Wallet Phone Number *')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('add-payout-currency-USD'));
    expect(screen.getByText('Bank account in Zimbabwe')).toBeTruthy();
  });
});
