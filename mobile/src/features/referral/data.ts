/**
 * Referral (ADR-009 / DEC-015). MOCK: the code and count come from the server in
 * production. The reward is 10% off the coordination fee, never money paid out.
 */

import { divRoundHalfEven } from '../market/money';
import { tr } from "../../i18n";

export const REFERRAL = {
  /** Server-issued; Figma's sample code. */
  code: 'H73B373H',
  friendsJoined: 0,
} as const;

/** 10% in basis points, so the maths stays in integers. */
export const REFERRAL_DISCOUNT_BPS = 1000;

/**
 * Discount on a fee in minor units, rounded half to even (same rule as every money
 * conversion). BigInt, so large fees keep full precision. Display/test helper only — the
 * server applies the real discount.
 */
export function referralDiscountMinor(feeMinor: number): number {
  if (!Number.isSafeInteger(feeMinor) || feeMinor < 0) throw new Error('fee must be a non-negative integer (minor units)');
  return Number(divRoundHalfEven(BigInt(feeMinor) * BigInt(REFERRAL_DISCOUNT_BPS), 10000n));
}

export function inviteMessage(code: string): string {
  return tr("Join me on Xspeeria to exchange currency with other people. Use my referral code {{code}} and we both get 10% off the coordination fee on our next exchange.", { code });
}
