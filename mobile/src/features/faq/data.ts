/**
 * FAQ content (ADR-007 A7). Figma has one real question (with a product-name slip,
 * "Tradebase") and lorem ipsum for the rest; these answers are written from the approved
 * docs and avoid figures and claims that are not yet approved (no fee amount, no licence
 * claims, no settlement-window length). NEEDS LEGAL/COMPLIANCE REVIEW BEFORE RELEASE.
 */

export type FaqTopic = 'start' | 'sell' | 'payments';

export interface FaqTopicInfo {
  readonly key: FaqTopic;
  readonly title: string;
}

export const FAQ_TOPICS: readonly FaqTopicInfo[] = [
  { key: 'start', title: 'Getting Started' },
  { key: 'sell', title: 'How to Sell' },
  { key: 'payments', title: 'Payments' },
];

export interface FaqItem {
  readonly id: string;
  readonly topic: FaqTopic;
  readonly question: string;
  readonly answer: string;
  /** Shown under "Top Questions" before "View all". */
  readonly top?: boolean;
}

export const FAQ: readonly FaqItem[] = [
  {
    id: 'create-account',
    topic: 'start',
    top: true,
    question: 'How do I create an account?',
    answer:
      "Open the Xspeeria app to get started and follow the steps. Xspeeria doesn't charge a fee to create or maintain your Xspeeria account.",
  },
  {
    id: 'verify-identity',
    topic: 'start',
    top: true,
    question: 'Why do I need to verify my identity?',
    answer:
      'You need approved identity verification (KYC) before you can create or accept an offer. Your verification level also sets your limits, which you can see in Profile → KYC and limits.',
  },
  {
    id: 'two-factor',
    topic: 'start',
    question: 'Why do I need 2 FA?',
    answer:
      'Two-factor authentication is required to trade. We ask for a code when you sign in on a new phone and before sensitive changes such as adding a beneficiary. We never send codes by SMS, and our staff will never ask for your codes.',
  },
  {
    id: 'how-to-sell',
    topic: 'sell',
    top: true,
    question: 'How do I sell currency?',
    answer:
      'Go to Market, choose Sell, enter the amount and your rate, then pick a match from the list. You can also see your open offers from the menu on the Market screen.',
  },
  {
    id: 'own-rate',
    topic: 'sell',
    question: 'Can I set my own rate?',
    answer:
      'Yes. You choose your rate. It must be above zero and cannot be higher than the official rate for that currency, which is shown on the Market screen; a higher rate cannot be used.',
  },
  {
    id: 'no-fund',
    topic: 'sell',
    question: "What happens if the other person doesn't pay?",
    answer:
      'Nothing is released until both sides have paid. If the other person does not pay in time, the money you paid is returned to you in full and your order goes back to the marketplace to find a new match.',
  },
  {
    id: 'hold-money',
    topic: 'payments',
    top: true,
    question: 'Does Xspeeria hold my money?',
    answer:
      'No. Xspeeria never holds your money and has no wallet or balance. Each side pays into a local account held by a partner bank in their own country, and money is released to both sides only after both have paid. No currency crosses the border.',
  },
  {
    id: 'cost',
    topic: 'payments',
    question: 'How much does it cost?',
    answer:
      'Xspeeria charges a coordination fee of 1% of the money each side sends, in the currency that side sends. There is no hidden margin in the rate, and the fee is shown before you confirm.',
  },
  {
    id: 'when-paid',
    topic: 'payments',
    question: 'When will I receive my money?',
    answer:
      'Once both sides have paid, the partner bank pays your beneficiary account. You can follow every step in History. For your safety, adding a beneficiary and choosing where a deal is paid each need your authenticator code.',
  },
  {
    id: 'countries',
    topic: 'payments',
    question: 'Which currencies can I exchange?',
    answer: 'Xspeeria starts with Naira and British Pounds (NGN ⇄ GBP). Naira and US Dollars (NGN ⇄ USD) is planned next.',
  },
];

export function filterFaq(items: readonly FaqItem[], query: string, topic: FaqTopic | null): FaqItem[] {
  const q = query.trim().toLowerCase();
  return items.filter(
    (i) =>
      (topic === null || i.topic === topic) &&
      (q === '' || i.question.toLowerCase().includes(q) || i.answer.toLowerCase().includes(q)),
  );
}
