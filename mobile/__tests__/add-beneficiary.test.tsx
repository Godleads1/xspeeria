import { fireEvent, render, screen } from '@testing-library/react-native';

import { AddBeneficiaryScreen } from '../src/features/profile/AddBeneficiaryScreen';
import { BeneficiariesScreen } from '../src/features/profile/BeneficiariesScreen';
import { beneficiaryStore } from '../src/features/profile/beneficiaryStore';
import { isValidRoutingNumber, validateBankForm } from '../src/features/profile/data';

beforeEach(() => beneficiaryStore.reset());

describe('bank form validation', () => {
  it('checks the ABA routing checksum', () => {
    expect(isValidRoutingNumber('021000021')).toBe(true);
    expect(isValidRoutingNumber('021000022')).toBe(false);
    expect(isValidRoutingNumber('12345')).toBe(false);
  });

  it('applies each country format', () => {
    expect(validateBankForm('NGN', { bankName: 'Access Bank', accountNumber: '0123456789' })).toEqual({});
    expect(validateBankForm('NGN', { bankName: 'Access Bank', accountNumber: '12345' }).accountNumber).toMatch(/10 digits/);
    expect(validateBankForm('GBP', { sortCode: '123456', bankName: 'Barclays', accountNumber: '12345678' })).toEqual({});
    expect(validateBankForm('GBP', { sortCode: '1234', bankName: 'Barclays', accountNumber: '1234567' })).toEqual({
      sortCode: 'Sort code is 6 digits',
      accountNumber: 'UK account numbers are 8 digits',
    });
    expect(
      validateBankForm('USD', { routingNumber: '021000021', bankName: 'Chase', accountNumber: '123456789', accountType: 'Checking' }),
    ).toEqual({});
    expect(validateBankForm('USD', { routingNumber: '021000021', bankName: 'Chase', accountNumber: '1234', accountType: 'Gold' }).accountType).toBeTruthy();
    expect(Object.keys(validateBankForm('NGN', {}))).toEqual(['bankName', 'accountNumber']);
  });
});

describe('Account Details screen', () => {
  it('shows the Figma US fields when USD is chosen', async () => {
    await render(<AddBeneficiaryScreen currency="USD" onBack={jest.fn()} onDone={jest.fn()} />);
    for (const l of ['Routing Number *', 'Bank Name *', 'Account Number *', 'Account Type *']) expect(screen.getByText(l)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('field-accountType'));
    await fireEvent.press(screen.getByTestId('account-type-sheet-Savings'));
    expect(screen.getByText('Savings')).toBeTruthy();
  });

  it('uses national formats for Nigeria and the UK', async () => {
    await render(<AddBeneficiaryScreen currency="GBP" onBack={jest.fn()} onDone={jest.fn()} />);
    expect(screen.getByText('Sort Code *')).toBeTruthy();
    expect(screen.queryByText('Routing Number *')).toBeNull();
  });

  it('blocks submit with errors and strips non-digits', async () => {
    const onDone = jest.fn();
    await render(<AddBeneficiaryScreen currency="NGN" onBack={jest.fn()} onDone={onDone} />);
    await fireEvent.changeText(screen.getByTestId('field-accountNumber'), '01-23 45');
    expect(screen.getByTestId('field-accountNumber').props.value).toBe('012345');
    await fireEvent.press(screen.getByTestId('add-beneficiary-submit'));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId('error-bankName')).toBeTruthy();
    expect(screen.getByTestId('error-accountNumber')).toBeTruthy();
  });

  it('adds a pending beneficiary holding only the last 4 digits', async () => {
    const onDone = jest.fn();
    await render(<AddBeneficiaryScreen currency="NGN" onBack={jest.fn()} onDone={onDone} />);
    await fireEvent.changeText(screen.getByTestId('field-bankName'), 'GTBank');
    await fireEvent.changeText(screen.getByTestId('field-accountNumber'), '0123456789');
    await fireEvent.press(screen.getByTestId('add-beneficiary-submit'));
    expect(onDone).toHaveBeenCalledTimes(1);
    const added = beneficiaryStore.get().at(-1);
    expect(added).toMatchObject({ currency: 'NGN', bank: 'GTBank', accountLast4: '6789', status: 'pending' });
    expect(JSON.stringify(beneficiaryStore.get())).not.toContain('0123456789');

    await render(<BeneficiariesScreen onBack={jest.fn()} />);
    expect(screen.getByText('Awaiting bank verification')).toBeTruthy();
    expect(screen.getByText('•••• 6789')).toBeTruthy();
  });
});
