/** ADR-055: server builds show the name, date of birth and gender from the ID check, never a sample. */
import { render, screen } from '@testing-library/react-native';

import { DetailsScreen } from '../src/features/auth/SignupScreens';
import { AccountDetailsScreen } from '../src/features/profile/AccountDetailsScreen';
import { genderLabel, nameInitials } from '../src/features/profile/data';
import { profileStore } from '../src/features/profile/profileStore';

const ID = { userId: '8f6c0c0e-1111-4c4c-9c9c-000000000001', phone: '+2348031112222', email: 'ada@example.com' };

afterEach(() => profileStore.reset());

describe('identity from the ID check (ADR-055)', () => {
  it('fills the profile from the server and words the gender', () => {
    profileStore.setServerIdentity({ ...ID, legalName: 'Ada Obi', dateOfBirth: '1990-05-17', gender: 'F' });
    const p = profileStore.get();
    expect(p).toMatchObject({ fullName: 'Ada Obi', initials: 'AO', dateOfBirth: '1990-05-17', gender: 'F', handle: 'User 8F6C', ratingHundredths: 0 });
    expect(genderLabel('F')).toBe('Female');
    expect(genderLabel('M')).toBe('Male');
    expect(genderLabel('')).toBe('');
    expect(nameInitials('', 'a')).toBe('A');
  });

  it('before the check: no sample person, a clear placeholder', async () => {
    profileStore.setServerIdentity({ ...ID, legalName: null, dateOfBirth: null, gender: null });
    await render(<AccountDetailsScreen onBack={jest.fn()} serverRegions={[]} />);
    expect(screen.queryByText('David Peters')).toBeNull();
    expect(screen.getAllByText('From your ID once verified')).toHaveLength(3);
  });

  it('after the check: the real details', async () => {
    profileStore.setServerIdentity({ ...ID, legalName: 'Ada Obi', dateOfBirth: '1990-05-17', gender: 'F' });
    await render(<AccountDetailsScreen onBack={jest.fn()} serverRegions={[]} />);
    expect(screen.getByText('Ada Obi')).toBeTruthy();
    expect(screen.getByText('Female')).toBeTruthy();
  });

  it('sign-up asks only for the email in server builds', async () => {
    await render(<DetailsScreen server onBack={jest.fn()} onNext={jest.fn()} />);
    expect(screen.queryByTestId('signup-first')).toBeNull();
    expect(screen.queryByTestId('signup-gender')).toBeNull();
    expect(screen.getByTestId('signup-identity-later')).toBeTruthy();
    expect(screen.queryByText('David')).toBeNull();
  });
});
