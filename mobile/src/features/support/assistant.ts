/**
 * "Alex" support assistant (ADR-007 A10). Offline and rule-based: answers come only from
 * the approved FAQ content (src/features/faq/data.ts). It never invents an answer; when
 * nothing matches it says live support is not connected yet. No AI model, no backend.
 */

import { FAQ, type FaqItem } from '../faq/data';

export const SUPPORT_EMAIL = 'Xspeeria@intelyticslimited.com';

export interface QuickReply {
  readonly label: string;
  readonly faqId: string;
}

export const QUICK_REPLIES: readonly QuickReply[] = [
  { label: 'Opening an account', faqId: 'create-account' },
  { label: 'How to sell', faqId: 'how-to-sell' },
  { label: 'Fees', faqId: 'cost' },
  { label: 'Is my money safe?', faqId: 'hold-money' },
];

export function greeting(firstName: string): string {
  return `Hi ${firstName}, let me know if you need help. You can ask me any questions.`;
}

export const FALLBACK = `I couldn't find an answer to that. Chat with our support team isn't available in this version of the app yet. You can email ${SUPPORT_EMAIL}.`;

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

/**
 * Stops secrets being typed into chat: 2FA codes, recovery codes, card numbers and full
 * account numbers. Staff never need them (ADR-008). Returns a warning, or null if safe.
 */
export function sensitiveWarning(message: string): string | null {
  if (/password|passcode|\bpin\b/i.test(message) && /[:=]|\bis\b/i.test(message)) {
    return 'Never share your password or PIN, not even with Xspeeria support.';
  }
  if (/\b[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}\b/.test(message)) {
    return 'That looks like a recovery code. Never share it with anyone, including Xspeeria support.';
  }
  const digits = message.replace(/[\s-]/g, '');
  if (/\d{8,}/.test(digits)) {
    return 'Please don’t send full account or card numbers in chat. The last 4 digits are enough.';
  }
  if (/(^|\D)\d{6}(\D|$)/.test(message)) {
    return 'That looks like a 2 FA code. Never share codes with anyone, including Xspeeria support.';
  }
  return null;
}
