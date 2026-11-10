import { dayMonthYear, k, language, monthName, tr } from "../../i18n";

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

/** ADR-055: the ID's "M"/"F" in words; empty when not known. */
export function genderLabel(gender: string): string {
  if (gender === 'M' || gender === 'Male') return tr("Male");
  if (gender === 'F' || gender === 'Female') return tr("Female");
  return '';
}

/** Initials of a name ("Ada Obi" → "AO"); the fallback when there is no name. */
export function nameInitials(name: string, fallback = ''): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const out = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0]?.slice(0, 2) ?? '');
  return (out || fallback).toUpperCase();
}

export type KycState = 'approved' | 'pending';

export interface KycRegion {
  /** Currency code used to pick the round flag. */
  readonly flag: string;
  readonly name: string;
  readonly state: KycState;
}

export const KYC_REGIONS: readonly KycRegion[] = [
  { flag: 'NGN', name: k("Nigeria"), state: 'approved' },
  { flag: 'GBP', name: k("United Kingdom"), state: 'approved' },
  { flag: 'ETB', name: k("Ethiopia"), state: 'pending' },
];

/** `1997-07-12` → `12th July 1997` (Figma format, English); other languages their own order. */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!language.get().startsWith('en')) return dayMonthYear(d, m - 1, y);
  const suffix =
    d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th';
  return language.get() === 'en-US' ? `${monthName(m - 1)} ${d}${suffix}, ${y}` : `${d}${suffix} ${monthName(m - 1)} ${y}`;
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
  /** Banking spec §3.3: saved, then confirmed by the partner's account-name inquiry. */
  readonly status: 'pending' | 'verified';
}

export const BENEFICIARY_FILTERS = ['All', 'USD', 'NGN', 'GBP', 'GHS'] as const;
export type BeneficiaryFilter = (typeof BENEFICIARY_FILTERS)[number];

export const BENEFICIARIES: readonly Beneficiary[] = [
  { id: 'b1', name: 'Tunde Bakere Olamilekan', currency: 'NGN', bank: 'Access Bank', accountLast4: '9309', status: 'verified' },
  // The user's own payout accounts (demo, ADR-014): trades pay out only to these (Banking spec §3.3).
  { id: 'b2', name: 'David Peters', currency: 'NGN', bank: 'GTBank', accountLast4: '5521', status: 'verified' },
  { id: 'b3', name: 'David Peters', currency: 'USD', bank: 'Chase', accountLast4: '4410', status: 'verified' },
  { id: 'b4', name: 'David Peters', currency: 'EUR', bank: 'Revolut', accountLast4: '2207', status: 'verified' },
  // Second own accounts so a payout can be split (ADR-021). Mock.
  { id: 'b5', name: 'David Peters', currency: 'USD', bank: 'Bank of America', accountLast4: '7781', status: 'verified' },
  { id: 'b6', name: 'David Peters', currency: 'NGN', bank: 'Zenith Bank', accountLast4: '3390', status: 'verified' },
  { id: 'b7', name: 'David Peters', currency: 'GBP', bank: 'Monzo', accountLast4: '6142', status: 'verified' },
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
  { name: k("Nigeria"), currency: 'NGN', available: true },
  { name: k("United Kingdom"), currency: 'GBP', available: true },
  { name: k("United States"), currency: 'USD', available: true },
  { name: k("Canada"), currency: 'CAD', available: true },
  // ADR-105: Germany and France both take euro accounts (IBAN), so one row.
  { name: k("Germany and France"), currency: 'EUR', available: true },
];

export function searchCountries(list: readonly DestinationCountry[], query: string): DestinationCountry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...list];
  return list.filter((c) => c.name.toLowerCase().includes(q) || c.currency.toLowerCase().includes(q));
}

/* ------------------------------------------------------------ Account details form */

export type BankFieldKey =
  | 'routingNumber'
  | 'sortCode'
  | 'institutionNumber'
  | 'transitNumber'
  | 'cnapsCode'
  | 'bankName'
  | 'accountNumber'
  | 'accountType';

export interface BankField {
  readonly key: BankFieldKey;
  readonly label: string;
  readonly kind: 'digits' | 'text' | 'select' | 'iban';
  readonly maxLength?: number;
}

/**
 * Fields per payout country. Figma draws the US form (routing number, bank, account,
 * account type); Nigeria (10-digit NUBAN) and the UK (sort code + 8-digit account) use
 * their own national formats; euro accounts take the IBAN only, no BIC (owner, 2026-11-08,
 * ADR-099). The account holder's name is never typed: the partner bank
 * returns it and it must match the user's KYC legal name (Banking spec v1.1 §3.3).
 */
export const BANK_FORMS: Readonly<Record<string, readonly BankField[]>> = {
  USD: [
    { key: 'routingNumber', label: k("Routing Number"), kind: 'digits', maxLength: 9 },
    { key: 'bankName', label: k("Bank Name"), kind: 'text', maxLength: 60 },
    { key: 'accountNumber', label: k("Account Number"), kind: 'digits', maxLength: 17 },
    { key: 'accountType', label: k("Account Type"), kind: 'select' },
  ],
  NGN: [
    { key: 'bankName', label: k("Bank Name"), kind: 'text', maxLength: 60 },
    { key: 'accountNumber', label: k("Account Number"), kind: 'digits', maxLength: 10 },
  ],
  GBP: [
    { key: 'sortCode', label: k("Sort Code"), kind: 'digits', maxLength: 6 },
    { key: 'bankName', label: k("Bank Name"), kind: 'text', maxLength: 60 },
    { key: 'accountNumber', label: k("Account Number"), kind: 'digits', maxLength: 8 },
  ],
  EUR: [
    { key: 'bankName', label: k("Bank Name"), kind: 'text', maxLength: 60 },
    { key: 'accountNumber', label: k("IBAN"), kind: 'iban', maxLength: 34 },
  ],
  // ADR-100 (owner, 2026-11-09): institution (3 digits), transit (5 digits), any account number.
  CAD: [
    { key: 'institutionNumber', label: k("Institution Number"), kind: 'digits', maxLength: 3 },
    { key: 'transitNumber', label: k("Transit Number"), kind: 'digits', maxLength: 5 },
    { key: 'bankName', label: k("Bank Name"), kind: 'text', maxLength: 60 },
    { key: 'accountNumber', label: k("Account Number"), kind: 'digits', maxLength: 17 },
  ],
  // ADR-105 (owner, 2026-11-10): bank name, 16–19 digit card or account number, CNAPS code.
  CNY: [
    { key: 'cnapsCode', label: k("CNAPS Code"), kind: 'digits', maxLength: 12 },
    { key: 'bankName', label: k("Bank Name"), kind: 'text', maxLength: 60 },
    { key: 'accountNumber', label: k("Card or Account Number"), kind: 'digits', maxLength: 19 },
  ],
};

/** An IBAN as typed, without spaces and in capitals (it is usually written in groups of 4). */
export function normalizeIban(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * ISO 13616: 2-letter country, 2 check digits, up to 30 letters/digits, and mod 97 == 1.
 * Format and checksum only (it catches typos); the server checks again and the bank confirms.
 */
export function isValidIban(v: string): boolean {
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(v)) return false;
  const moved = v.slice(4) + v.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const n = parseInt(ch, 36);
    for (const d of String(n)) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

export const ACCOUNT_TYPES = ['Checking', 'Savings'] as const;

export type BankFormValues = Partial<Record<BankFieldKey, string>>;

/**
 * ABA routing number: 9 ASCII digits, a first-two-digit prefix the Federal Reserve assigns
 * (00 US government, 01–12 banks, 21–32 thrifts, 61–72 electronic, 80 traveller's cheques),
 * not all zeros, and the 3-7-1 checksum. Format check only; the bank confirms the account.
 */
export function isValidRoutingNumber(v: string): boolean {
  if (!/^[0-9]{9}$/.test(v) || v === '000000000') return false;
  const prefix = Number(v.slice(0, 2));
  const prefixOk = prefix <= 12 || (prefix >= 21 && prefix <= 32) || (prefix >= 61 && prefix <= 72) || prefix === 80;
  if (!prefixOk) return false;
  const d = v.split('').map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

/** Client-side format checks only; the server and partner bank remain authoritative. */
export function validateBankForm(currency: string, v: BankFormValues): Partial<Record<BankFieldKey, string>> {
  const errors: Partial<Record<BankFieldKey, string>> = {};
  const fields = BANK_FORMS[currency];
  if (!fields) return errors;
  for (const f of fields) {
    const value = (v[f.key] ?? '').trim();
    if (value === '') {
      errors[f.key] = tr("{{label}} is required", { label: tr(f.label) });
      continue;
    }
    if (f.key === 'bankName' && value.length < 2) errors.bankName = tr("Enter the bank name");
    if (f.key === 'routingNumber' && !isValidRoutingNumber(value)) errors.routingNumber = tr("Enter a valid 9-digit routing number");
    if (f.key === 'sortCode' && !/^\d{6}$/.test(value)) errors.sortCode = tr("Sort code is 6 digits");
    if (f.key === 'institutionNumber' && !/^\d{3}$/.test(value)) errors.institutionNumber = tr("Institution number is 3 digits");
    if (f.key === 'transitNumber' && !/^\d{5}$/.test(value)) errors.transitNumber = tr("Transit number is 5 digits");
    if (f.key === 'cnapsCode' && !/^\d{12}$/.test(value)) errors.cnapsCode = tr("The CNAPS code is 12 digits");
    if (f.key === 'accountType' && !(ACCOUNT_TYPES as readonly string[]).includes(value)) errors.accountType = tr("Choose an account type");
    if (f.key === 'accountNumber') {
      if (currency === 'NGN' && !/^\d{10}$/.test(value)) errors.accountNumber = tr("Nigerian account numbers are 10 digits");
      if (currency === 'GBP' && !/^\d{8}$/.test(value)) errors.accountNumber = tr("UK account numbers are 8 digits");
      if (currency === 'USD' && !/^\d{4,17}$/.test(value)) errors.accountNumber = tr("Enter a valid account number");
      if (currency === 'EUR' && !isValidIban(normalizeIban(value))) errors.accountNumber = tr("Enter a valid IBAN");
      if (currency === 'CAD' && !/^\d{1,17}$/.test(value)) errors.accountNumber = tr("Enter a valid account number");
      if (currency === 'CNY' && !/^\d{16,19}$/.test(value)) errors.accountNumber = tr("Chinese bank card and account numbers are 16 to 19 digits");
    }
  }
  return errors;
}

/* --------------------------------------------------------------------- KYC tiers */

/**
 * KYC tiers and monthly limits as drawn in Figma ("KYC and limits").
 *
 * PLACEHOLDER — NOT APPROVED. The Compliance Operations Manual (ASSUMPTION-COM-01) says
 * numeric tier thresholds are set by Compliance and Risk before go-live; no figure is
 * approved yet. These are Figma's numbers for layout only. Limits are always enforced
 * server-side; the app only displays them. Whole naira, integers (never floats).
 */
export interface KycTier {
  readonly level: number;
  readonly monthlyLimitNaira: number;
  readonly requirements: readonly string[];
}

export const KYC_TIERS: readonly KycTier[] = [
  { level: 1, monthlyLimitNaira: 50_000, requirements: ['BVN', 'NIN', k("International Passport")] },
  { level: 2, monthlyLimitNaira: 100_000, requirements: ['BVN', 'NIN', k("International Passport")] },
  { level: 3, monthlyLimitNaira: 150_000, requirements: ['BVN', 'NIN', k("International Passport")] },
];

/** The signed-in user's current tier (mock; the server is authoritative). */
export const CURRENT_KYC_TIER = 1;

/** 50000 → `50,000`. Integer-only grouping. */
export function groupThousands(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('groupThousands expects a non-negative safe integer');
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
