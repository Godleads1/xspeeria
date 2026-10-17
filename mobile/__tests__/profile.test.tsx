import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { AccountDetailsScreen } from '../src/features/profile/AccountDetailsScreen';
import { ProfileScreen } from '../src/features/profile/ProfileScreen';
import { formatRating, longDate } from '../src/features/profile/data';

describe('profile helpers', () => {
  it('formats the Figma date of birth and rating', () => {
    expect(longDate('1997-07-12')).toBe('12th July 1997');
    expect(longDate('2000-01-01')).toBe('1st January 2000');
    expect(longDate('2000-03-22')).toBe('22nd March 2000');
    expect(longDate('2000-03-13')).toBe('13th March 2000');
    expect(formatRating(486)).toBe('4.86');
    expect(formatRating(500)).toBe('5.00');
  });
});

describe('Profile (Figma 268:6134)', () => {
  it('lists every Figma row and routes each one', async () => {
    const onOpen = jest.fn();
    await render(<ProfileScreen onOpen={onOpen} />);
    for (const title of [
      'Manage Beneficiaries', 'KYC and limits', 'Security', 'FAQ',
      'Contact Support', 'Referral Program', 'Terms and Conditions', 'Switch Mode',
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    await fireEvent.press(screen.getByTestId('profile-security'));
    expect(onOpen).toHaveBeenCalledWith('security');
  });

  it('shows a colour icon on every menu row', async () => {
    await render(<ProfileScreen onOpen={jest.fn()} />);
    for (const n of ['beneficiaries', 'kyc', 'security', 'faq', 'support', 'referral', 'terms', 'mode']) {
      expect(screen.getByTestId(`menu-icon-${n}`, { includeHiddenElements: true })).toBeTruthy();
    }
  });

  it('keeps the dark-mode switch disabled until a dark palette exists', async () => {
    await render(<ProfileScreen onOpen={jest.fn()} />);
    expect(screen.getByTestId('profile-mode').props.disabled).toBe(true);
  });

  it('asks before Delete Profile and never deletes in one tap', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onOpen = jest.fn();
    await render(<ProfileScreen onOpen={onOpen} />);
    await fireEvent.press(screen.getByTestId('profile-delete'));
    expect(alert).toHaveBeenCalledWith('Delete your profile?', expect.any(String), expect.any(Array));
    expect(onOpen).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});

describe('Account details (Figma 1041:11224)', () => {
  it('shows the handle, rating, details and KYC regions', async () => {
    await render(<AccountDetailsScreen onBack={jest.fn()} />);
    expect(screen.getByText('User 4883')).toBeTruthy();
    expect(screen.getByLabelText('Rated 4.86 out of 5')).toBeTruthy();
    expect(screen.getByText('12th July 1997')).toBeTruthy();
    expect(screen.getByTestId('kyc-NGN')).toBeTruthy();
    expect(screen.getByTestId('kyc-ETB')).toBeTruthy();
    expect(screen.getAllByText('Approved').length).toBe(2);
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('goes back', async () => {
    const onBack = jest.fn();
    await render(<AccountDetailsScreen onBack={onBack} />);
    await fireEvent.press(screen.getByTestId('account-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
