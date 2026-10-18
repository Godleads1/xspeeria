import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { beneficiaryStore } from '../src/features/profile/beneficiaryStore';
import { BeneficiariesScreen } from '../src/features/profile/BeneficiariesScreen';
import {
  BENEFICIARIES,
  filterBeneficiaries,
  initialsOf,
  maskAccount,
  type Beneficiary,
} from '../src/features/profile/data';

const LIST: Beneficiary[] = [
  ...BENEFICIARIES,
  { id: 'x2', name: 'Ama Mensah', currency: 'GHS', bank: 'GCB Bank', accountLast4: '1122', status: 'pending' },
];

const allow = async (): Promise<boolean> => true;

describe('beneficiary helpers', () => {
  it('masks to the last 4 and builds initials', () => {
    expect(maskAccount('9309')).toBe('•••• 9309');
    expect(initialsOf('Tunde Bakere Olamilekan')).toBe('TO');
    expect(initialsOf('  ada  ')).toBe('A');
    expect(initialsOf('')).toBe('');
  });

  it('filters by currency and by name, case-insensitively', () => {
    expect(filterBeneficiaries(LIST, '', 'All')).toHaveLength(LIST.length);
    expect(filterBeneficiaries(LIST, '', 'GHS').map((b) => b.id)).toEqual(['x2']);
    expect(filterBeneficiaries(LIST, 'TUNDE', 'All').map((b) => b.id)).toEqual(['b1']);
    expect(filterBeneficiaries(LIST, 'tunde', 'GHS')).toHaveLength(0);
  });

  it('never holds a full account number in mock data', () => {
    for (const b of BENEFICIARIES) expect(b.accountLast4).toMatch(/^\d{4}$/);
    expect(JSON.stringify(BENEFICIARIES)).not.toMatch(/\d{5,}/);
  });
});

describe('Manage Beneficiaries screen', () => {
  beforeEach(() => beneficiaryStore.reset());
  afterEach(() => jest.restoreAllMocks());

  it('renders the Figma content with a masked account', async () => {
    await render(<BeneficiariesScreen onBack={jest.fn()} stepUp={allow} />);
    expect(screen.getByText('Manage Beneficiaries')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search name')).toBeTruthy();
    for (const f of ['All', 'USD', 'NGN', 'GBP', 'GHS']) expect(screen.getByTestId(`beneficiary-filter-${f}`)).toBeTruthy();
    expect(screen.getByText('Tunde Bakere Olamilekan')).toBeTruthy();
    expect(screen.getByText('•••• 9309')).toBeTruthy();
    expect(screen.queryByText('920298299309')).toBeNull();
    expect(screen.getByText('TO')).toBeTruthy();
  });

  it('filters with chips and search, showing an empty state', async () => {
    await render(<BeneficiariesScreen onBack={jest.fn()} stepUp={allow} />);
    await fireEvent.press(screen.getByTestId('beneficiary-filter-GHS'));
    expect(screen.getByTestId('beneficiaries-empty')).toBeTruthy(); // no GHS accounts
    await fireEvent.press(screen.getByTestId('beneficiary-filter-GBP'));
    expect(screen.getByText('•••• 6142')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('beneficiary-filter-All'));
    await fireEvent.changeText(screen.getByTestId('beneficiaries-search'), 'zzz');
    expect(screen.getByTestId('beneficiaries-empty')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('beneficiaries-search'), 'bakere');
    expect(screen.getByText('Tunde Bakere Olamilekan')).toBeTruthy();
  });

  it('asks before deleting and only deletes on confirm', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<BeneficiariesScreen onBack={jest.fn()} stepUp={allow} />);
    await fireEvent.press(screen.getByTestId('beneficiary-delete-b1'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Tunde Bakere Olamilekan')).toBeTruthy();
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Delete']);
    const del = buttons.find((b) => b.text === 'Delete');
    await act(async () => del?.onPress?.());
    expect(screen.queryByText('Tunde Bakere Olamilekan')).toBeNull();
  });

  it('keeps the beneficiary when the 2FA check fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const deny = jest.fn(async () => false);
    await render(<BeneficiariesScreen onBack={jest.fn()} stepUp={deny} />);
    await fireEvent.press(screen.getByTestId('beneficiary-delete-b1'));
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === 'Delete')?.onPress?.());
    expect(deny).toHaveBeenCalledWith(expect.stringMatching(/9309/));
    expect(screen.getByText('Tunde Bakere Olamilekan')).toBeTruthy();
  });

  it('back and add are wired', async () => {
    const onBack = jest.fn();
    const onAdd = jest.fn();
    await render(<BeneficiariesScreen onBack={onBack} onAdd={onAdd} stepUp={allow} />);
    await fireEvent.press(screen.getByTestId('beneficiaries-back'));
    await fireEvent.press(screen.getByTestId('beneficiaries-add'));
    expect(onBack).toHaveBeenCalled();
    expect(onAdd).toHaveBeenCalled();
  });
});
