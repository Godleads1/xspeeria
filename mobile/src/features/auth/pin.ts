import { tr } from "../../i18n";

/**
 * PIN rules. 6 digits (product owner, 2026-10-18, ADR-024; Figma drew 4). Weak PINs (all
 * the same digit, or a straight run like 123456 / 654321) are refused. In production the
 * PIN is verified server-side and stored only as a slow salted hash.
 */

export const PIN_LENGTH = 6;

export function pinProblem(pin: string): string | null {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return tr("Enter {{PIN_LENGTH}} digits", { PIN_LENGTH });
  const d = pin.split('').map(Number);
  if (d.every((x) => x === d[0])) return tr("Avoid repeating the same digit");
  const up = d.every((x, i) => i === 0 || x === (d[i - 1] + 1) % 10);
  const down = d.every((x, i) => i === 0 || x === (d[i - 1] + 9) % 10);
  if (up || down) return tr("Avoid simple sequences like 1234");
  return null;
}

/** Constant-time comparison for equal-length secrets. */
export function sameSecret(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
