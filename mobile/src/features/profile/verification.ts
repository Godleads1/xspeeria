import { tr } from "../../i18n";

/**
 * Proof of ownership for a new phone number or email (ADR-011).
 *
 * A 6-digit code is sent to the NEW address; the change applies only when that code is
 * entered. Rules (mirrored server-side, which is authoritative): code expires after 10
 * minutes, 5 wrong tries end the attempt, a new code can be sent after 60 seconds.
 * The 10-minute / 60-second values are proposed defaults pending Open Decision 2.
 *
 * MOCK: no SMS or email provider is connected, so the code is generated here and, in
 * development builds only, shown on screen so the flow can be tried.
 */

export type ContactKind = 'phone' | 'email';

export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_AFTER_MS = 60 * 1000;
export const MAX_CODE_TRIES = 5;

export type RandomBytes = (n: number) => Uint8Array;

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

/** `+234 803 838 3838` / `+44 7700 900123` → digits with a leading +, or null if invalid. */
export function normalisePhone(input: string): string | null {
  const compact = input.replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(compact)) return null;
  if (compact.startsWith('+234') && compact.length !== 14) return null; // NG: +234 + 10 digits
  if (compact.startsWith('+44') && compact.length !== 13) return null; // UK: +44 + 10 digits
  return compact;
}

export function normaliseEmail(input: string): string | null {
  const e = input.trim();
  return e.length <= 254 && EMAIL_RE.test(e) ? e.toLowerCase() : null;
}

/** For notices: `+2348038383838` → `+234 ••• ••• 3838`; `david@example.com` → `d••••@example.com`. */
export function maskContact(kind: ContactKind, value: string): string {
  if (kind === 'phone') return `${value.slice(0, value.startsWith('+234') ? 4 : 3)} ••• ••• ${value.slice(-4)}`;
  const [user, domain] = value.split('@');
  return `${user.slice(0, 1)}••••@${domain}`;
}

export interface Challenge {
  readonly kind: ContactKind;
  readonly target: string;
  readonly code: string;
  readonly sentAt: number;
  readonly expiresAt: number;
  readonly triesLeft: number;
}

/** Uniform 6-digit code (rejection sampling on 32-bit values: no modulo bias). */
export function makeCode(random: RandomBytes): string {
  const limit = Math.floor(2 ** 32 / 1_000_000) * 1_000_000;
  for (;;) {
    const b = random(4);
    const n = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
    if (n < limit) return String(n % 1_000_000).padStart(6, '0');
  }
}

export function sendChallenge(kind: ContactKind, target: string, now: number, random: RandomBytes): Challenge {
  return { kind, target, code: makeCode(random), sentAt: now, expiresAt: now + CODE_TTL_MS, triesLeft: MAX_CODE_TRIES };
}

export function canResend(c: Challenge, now: number): boolean {
  return now - c.sentAt >= RESEND_AFTER_MS;
}

export type CheckResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'expired' | 'used-up' | 'wrong'; readonly challenge: Challenge };

export function checkCode(c: Challenge, input: string, now: number): CheckResult {
  if (now > c.expiresAt) return { ok: false, reason: 'expired', challenge: c };
  if (c.triesLeft <= 0) return { ok: false, reason: 'used-up', challenge: c };
  let diff = input.length ^ c.code.length;
  for (let i = 0; i < c.code.length; i++) diff |= (input.charCodeAt(i) || 0) ^ c.code.charCodeAt(i);
  if (diff === 0) return { ok: true };
  const next = { ...c, triesLeft: c.triesLeft - 1 };
  return { ok: false, reason: next.triesLeft <= 0 ? 'used-up' : 'wrong', challenge: next };
}

/* --------------------------------------------------------------- Date of birth */

/** `12/07/1997` → `1997-07-12`, or null if not a real date. */
export function parseDob(input: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Whole years between an ISO birth date and `now`. */
export function ageOn(iso: string, now: Date): number {
  const [y, m, d] = iso.split('-').map(Number);
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age;
}

/** Xspeeria is for adults only (Privacy Policy §12). */
export function dobError(iso: string | null, now: Date): string | null {
  if (!iso) return tr("Enter a real date as DD/MM/YYYY");
  const age = ageOn(iso, now);
  if (age < 18) return tr("You must be 18 or older to use Xspeeria");
  if (age > 120) return tr("Check the year");
  return null;
}
