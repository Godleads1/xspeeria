/**
 * MOCK DATA for Profile (ADR-007). Follows the Figma Profile (268:6134) and Account
 * details (1041:11224) frames; the person is kept consistent with Home (David Peters).
 * This is the signed-in user's own data, shown only to them.
 */

export interface ProfileUser {
  readonly fullName: string;
  readonly initials: string;
  /** Public handle shown to counterparties instead of the real name. */
  readonly handle: string;
  /** Counterparty rating, hundredths out of 5 (486 = 4.86). */
  readonly ratingHundredths: number;
  readonly phone: string;
  readonly email: string;
  /** ISO date. */
  readonly dateOfBirth: string;
  readonly gender: string;
}

export const PROFILE_USER: ProfileUser = {
  fullName: 'David Peters',
  initials: 'DP',
  handle: 'User 4883',
  ratingHundredths: 486,
  phone: '+234 803 838 3838',
  email: 'davidpeters@example.com',
  dateOfBirth: '1997-07-12',
  gender: 'Male',
};

export type KycState = 'approved' | 'pending';

export interface KycRegion {
  /** Currency code used to pick the round flag. */
  readonly flag: string;
  readonly name: string;
  readonly state: KycState;
}

export const KYC_REGIONS: readonly KycRegion[] = [
  { flag: 'NGN', name: 'Nigerian', state: 'approved' },
  { flag: 'GBP', name: 'United Kingdom', state: 'approved' },
  { flag: 'ETB', name: 'Ethiopia', state: 'pending' },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** `1997-07-12` → `12th July 1997` (Figma format). */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const suffix =
    d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th';
  return `${d}${suffix} ${MONTHS[m - 1]} ${y}`;
}

/** 486 → `4.86`. */
export function formatRating(hundredths: number): string {
  return `${Math.trunc(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}`;
}
