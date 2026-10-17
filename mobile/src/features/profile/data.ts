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

/**
 * Payout accounts the user has saved (Figma Manage Beneficiaries). Only the last 4 digits
 * of an account number are ever held on the device; the full number stays server-side.
 * Third-party payouts are pending legal/partner-bank confirmation (DEC-007).
 */
export interface Beneficiary {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly bank: string;
  readonly accountLast4: string;
}

export const BENEFICIARY_FILTERS = ['All', 'USD', 'NGN', 'GBP', 'GHS'] as const;
export type BeneficiaryFilter = (typeof BENEFICIARY_FILTERS)[number];

export const BENEFICIARIES: readonly Beneficiary[] = [
  { id: 'b1', name: 'Tunde Bakere Olamilekan', currency: 'NGN', bank: 'Access Bank', accountLast4: '9309' },
];

/** `9309` → `•••• 9309`. */
export function maskAccount(last4: string): string {
  return `•••• ${last4}`;
}

/** `Tunde Bakere Olamilekan` → `TO` (first and last name). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

export function filterBeneficiaries(
  list: readonly Beneficiary[],
  query: string,
  filter: BeneficiaryFilter,
): Beneficiary[] {
  const q = query.trim().toLowerCase();
  return list.filter(
    (b) => (filter === 'All' || b.currency === filter) && (q === '' || b.name.toLowerCase().includes(q)),
  );
}

/**
 * Destination countries for a new beneficiary. Figma lists every country; payouts are
 * domestic via a licensed partner in each corridor (Banking spec v1.1 §2), so only the
 * documented corridors appear: NGN⇄GBP pilot, NGN⇄USD Year 2 (PRD "First Corridor").
 * Adding a country is a product + compliance decision, not a UI change.
 */
export interface DestinationCountry {
  readonly name: string;
  readonly currency: string;
  /** False = documented but not yet live; shown, not selectable. */
  readonly available: boolean;
  readonly note?: string;
}

export const DESTINATION_COUNTRIES: readonly DestinationCountry[] = [
  { name: 'Nigeria', currency: 'NGN', available: true },
  { name: 'United Kingdom', currency: 'GBP', available: true },
  { name: 'United States', currency: 'USD', available: false, note: 'Coming in Year 2' },
];

export function searchCountries(list: readonly DestinationCountry[], query: string): DestinationCountry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...list];
  return list.filter((c) => c.name.toLowerCase().includes(q) || c.currency.toLowerCase().includes(q));
}
