/**
 * "Alex" support assistant (ADR-007 A10). Offline and rule-based: answers come only from
 * the approved FAQ content (src/features/faq/data.ts). It never invents an answer; when
 * nothing matches it says live support is not connected yet. No AI model, no backend.
 */

import { FAQ, type FaqItem } from '../faq/data';
import { tr, k } from "../../i18n";

export const SUPPORT_EMAIL = 'Xspeeria@intelyticslimited.com';

export interface QuickReply {
  readonly label: string;
  readonly faqId: string;
}

export const QUICK_REPLIES: readonly QuickReply[] = [
  { label: k("Opening an account"), faqId: 'create-account' },
  { label: k("How to sell"), faqId: 'how-to-sell' },
  { label: k("Fees"), faqId: 'cost' },
  { label: k("Is my money safe?"), faqId: 'hold-money' },
];

export function greeting(firstName: string): string {
  return tr("Hi {{firstName}}, let me know if you need help. You can ask me any questions.", { firstName });
}

const FALLBACK_KEY = k("I couldn't find an answer to that. Chat with our support team isn't available in this version of the app yet. You can email {{SUPPORT_EMAIL}}.");

/** In the current language. */
export function fallbackAnswer(): string {
  return tr(FALLBACK_KEY, { SUPPORT_EMAIL });
}

/** English (tests and older callers). */
export const FALLBACK = k(FALLBACK_KEY, { SUPPORT_EMAIL });

const STOP = new Set(['what', 'when', 'where', 'which', 'with', 'that', 'this', 'have', 'does', 'your', 'from', 'about', 'there', 'would', 'could', 'should', 'xspeeria', 'please', 'help']);

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
}

/** Best FAQ match by shared keywords (question words count double). Null if none. */
export function bestAnswer(message: string, items: readonly FaqItem[] = FAQ): FaqItem | null {
  const query = new Set(words(message));
  if (query.size === 0) return null;
  let best: FaqItem | null = null;
  let bestScore = 0;
  for (const item of items) {
    const q = new Set(words(item.question));
    const a = new Set(words(item.answer));
    let score = 0;
    for (const w of query) {
      if (q.has(w)) score += 2;
      else if (a.has(w)) score += 1;
    }
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : null;
}

/** Recovery-code symbols (twoFactorStore: no 0/O/1/I/L/U). */
const RC = '[2-9A-HJKMNP-TV-Z]';
const CURRENCY = /(?:₦|\$|£|€|\b(?:NGN|USD|GBP|EUR|CAD|NAIRA|DOLLARS?|POUNDS?|EUROS?|KOBO|CENTS?)\b)/;

/** True if a 6-digit run at [start, end) has a currency word or symbol right beside it. */
function nearCurrency(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 8), start);
  const after = text.slice(end, end + 10);
  return new RegExp(`${CURRENCY.source}\\s*$`).test(before) || new RegExp(`^\\s*${CURRENCY.source}`).test(after);
}

/**
 * Stops secrets being typed into chat: PINs and passwords, 2FA codes, recovery codes,
 * authenticator keys, card numbers and full account numbers. Staff never need them
 * (ADR-008). Returns a warning, or null if safe.
 *
 * Text is normalised first (full-width digits, case, separators), because the verifier
 * accepts a recovery code in any of those forms, so the filter must too (SEC-05). Amounts
 * with a currency beside them ("150000 naira") are not mistaken for codes. This is a
 * convenience for the user; any real support channel must also redact on the server.
 */
export function sensitiveWarning(message: string): string | null {
  const text = message.normalize('NFKC').toUpperCase();

  const pinNearDigits = /\bPIN\b\D{0,12}\d{4,6}(?!\d)|(?<!\d)\d{4,6}\D{0,8}\bPIN\b/;
  const passwordValue = /\b(?:PASSWORD|PASSCODE)\b\s*(?:IS\b|[:=])?\s*(?=\S*[\d!@#$%^&*])\S{4,}|\b(?:PASSWORD|PASSCODE|PIN)\b\s*[:=]/;
  if (pinNearDigits.test(text) || passwordValue.test(text)) {
    return tr("Never share your password or PIN, not even with Xspeeria support.");
  }

  // XXXX-XXXX in any case or separator, or 8 recovery symbols together that include a digit
  // (8-letter words such as TRANSFER are not codes).
  const hyphenated = new RegExp(`(?<![0-9A-Z])${RC}{4}[\\s\\-_.]?${RC}{4}(?![0-9A-Z])`, 'g');
  for (const m of text.matchAll(hyphenated)) {
    if (/[\s\-_.]/.test(m[0]) || /\d/.test(m[0])) {
      return tr("That looks like a recovery code. Never share it with anyone, including Xspeeria support.");
    }
  }

  // Authenticator key: 16+ Base32 symbols, possibly in groups, containing a digit 2–7.
  for (const m of text.matchAll(/(?<![0-9A-Z])(?:[A-Z2-7]{4}[\s\-]?){4,}(?![0-9A-Z])/g)) {
    if (/[2-7]/.test(m[0])) {
      return tr("That looks like an authenticator key. Never share it with anyone, including Xspeeria support.");
    }
  }

  const digits = text.replace(/[\s-]/g, '');
  if (/\d{8,}/.test(digits)) {
    return tr("Please don’t send full account or card numbers in chat. The last 4 digits are enough.");
  }

  // 6 digits, also as authenticator apps show them ("123 456") or spaced one by one.
  for (const m of text.matchAll(/(?<![\d,.])(?:\d{6}|\d{3} \d{3}|\d(?: \d){5})(?![\d,.])/g)) {
    const start = m.index ?? 0;
    if (!nearCurrency(text, start, start + m[0].length)) {
      return tr("That looks like a 2 FA code. Never share codes with anyone, including Xspeeria support.");
    }
  }
  return null;
}
