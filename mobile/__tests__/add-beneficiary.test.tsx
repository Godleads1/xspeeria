import { fireEvent, render, screen } from '@testing-library/react-native';

import { AddBeneficiaryScreen } from '../src/features/profile/AddBeneficiaryScreen';
import { BeneficiariesScreen } from '../src/features/profile/BeneficiariesScreen';
import { beneficiaryStore } from '../src/features/profile/beneficiaryStore';
import { BENEFICIARIES, isValidIban, isValidRoutingNumber, normalizeIban, validateBankForm } from '../src/features/profile/data';

beforeEach(() => beneficiaryStore.reset());

const allow = async (): Promise<boolean> => true;

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
    // ADR-099: euro accounts take the IBAN only, no BIC; checked by its mod-97 checksum.
    expect(validateBankForm('EUR', { bankName: 'ING', accountNumber: 'DE89 3704 0044 0532 0130 00' })).toEqual({});
    expect(validateBankForm('EUR', { bankName: 'ING', accountNumber: 'DE89370400440532013001' }).accountNumber).toMatch(/valid IBAN/);
    expect(Object.keys(validateBankForm('EUR', {}))).toEqual(['bankName', 'accountNumber']);
    // ADR-100: Canada — institution (3 digits), transit (5 digits), any account number.
    expect(validateBankForm('CAD', { institutionNumber: '003', transitNumber: '12345', bankName: 'RBC', accountNumber: '1234567' })).toEqual({});
    const bad = validateBankForm('CAD', { institutionNumber: '03', transitNumber: '1234', bankName: 'RBC', accountNumber: '12a' });
    expect(Object.keys(bad).sort()).toEqual(['accountNumber', 'institutionNumber', 'transitNumber']);
  });
});

describe('Account Details screen', () => {
  it('shows the Figma US fields when USD is chosen', async () => {
    await render(<AddBeneficiaryScreen currency="USD" onBack={jest.fn()} onDone={jest.fn()} stepUp={allow} />);
    for (const l of ['Routing Number *', 'Bank Name *', 'Account Number *', 'Account Type *']) expect(screen.getByText(l)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('field-accountType'));
    await fireEvent.press(screen.getByTestId('account-type-sheet-Savings'));
    expect(screen.getByText('Savings')).toBeTruthy();
  });

  it('uses national formats for Nigeria and the UK', async () => {
    await render(<AddBeneficiaryScreen currency="GBP" onBack={jest.fn()} onDone={jest.fn()} stepUp={allow} />);
    expect(screen.getByText('Sort Code *')).toBeTruthy();
    expect(screen.queryByText('Routing Number *')).toBeNull();
  });

  it('blocks submit with errors and strips non-digits', async () => {
    const onDone = jest.fn();
    await render(<AddBeneficiaryScreen currency="NGN" onBack={jest.fn()} onDone={onDone} stepUp={allow} />);
    await fireEvent.changeText(screen.getByTestId('field-accountNumber'), '01-23 45');
    expect(screen.getByTestId('field-accountNumber').props.value).toBe('012345');
    await fireEvent.press(screen.getByTestId('add-beneficiary-submit'));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId('error-bankName')).toBeTruthy();
    expect(screen.getByTestId('error-accountNumber')).toBeTruthy();
  });

  it('adds a pending beneficiary holding only the last 4 digits', async () => {
    const onDone = jest.fn();
    await render(<AddBeneficiaryScreen currency="NGN" onBack={jest.fn()} onDone={onDone} stepUp={allow} />);
    await fireEvent.changeText(screen.getByTestId('field-bankName'), 'GTBank');
    await fireEvent.changeText(screen.getByTestId('field-accountNumber'), '0123456789');
    await fireEvent.press(screen.getByTestId('add-beneficiary-submit'));
    expect(onDone).toHaveBeenCalledTimes(1);
    const added = beneficiaryStore.get().at(-1);
    expect(added).toMatchObject({ currency: 'NGN', bank: 'GTBank', accountLast4: '6789', status: 'pending' });
    expect(JSON.stringify(beneficiaryStore.get())).not.toContain('0123456789');

    await render(<BeneficiariesScreen onBack={jest.fn()} stepUp={allow} />);
    expect(screen.getByText('Awaiting bank verification')).toBeTruthy();
    expect(screen.getByText('•••• 6789')).toBeTruthy();
  });
});

describe('2FA re-check (ADR-008)', () => {
  it('does not add a beneficiary when the check fails', async () => {
    const onDone = jest.fn();
    const deny = jest.fn(async () => false);
    await render(<AddBeneficiaryScreen currency="NGN" onBack={jest.fn()} onDone={onDone} stepUp={deny} />);
    await fireEvent.changeText(screen.getByTestId('field-bankName'), 'GTBank');
    await fireEvent.changeText(screen.getByTestId('field-accountNumber'), '0123456789');
    await fireEvent.press(screen.getByTestId('add-beneficiary-submit'));
    expect(deny).toHaveBeenCalledWith(expect.stringMatching(/NGN account at GTBank/));
    expect(onDone).not.toHaveBeenCalled();
    expect(beneficiaryStore.get()).toHaveLength(BENEFICIARIES.length);
  });

  it('does not ask for 2FA when the form is invalid', async () => {
    const check = jest.fn(async () => true);
    await render(<AddBeneficiaryScreen currency="NGN" onBack={jest.fn()} onDone={jest.fn()} stepUp={check} />);
    await fireEvent.press(screen.getByTestId('add-beneficiary-submit'));
    expect(check).not.toHaveBeenCalled();
  });
});

describe('IBAN (ADR-099)', () => {
  it('accepts real examples, including one ending in a letter, and refuses typos', () => {
    for (const v of ['DE89370400440532013000', 'FR1420041010050500013M02606', 'NL91ABNA0417164300', 'MT84MALT011000012345MTLCAST001S']) {
      expect(isValidIban(v)).toBe(true);
    }
    for (const v of ['DE89370400440532013001', 'DE8937040044', '1289370400440532013000', '']) {
      expect(isValidIban(v)).toBe(false);
    }
    expect(normalizeIban('de89 3704-0044')).toBe('DE8937040044');
  });
});
