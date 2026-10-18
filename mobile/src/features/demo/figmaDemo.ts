/**
 * FIGMA DEMO CONTENT — the only place in the app allowed to show a balance or card spend
 * (product owner, 2026-10-18: "use the exactly cards design for now and also the home too",
 * then chose "Exact incl. balances, demo"; `docs/adr/023-figma-exact-home-cards-demo.md`).
 *
 * Xspeeria holds no money and has no balance or wallet (Standing Standards §2). These are
 * Figma's own placeholder figures, shown so the design can be reviewed exactly:
 *   - development builds only: every export below is null / empty when DEMO_MODE is false
 *     (release builds), so no balance can ever ship;
 *   - each is marked "Demo" on screen;
 *   - nothing reads or writes them: they are fixed display text, not amounts anyone holds.
 *
 * The no-balance guard (`__tests__/no-balance.test.ts`) exempts this folder only, and checks
 * that every file in it is gated on DEMO_MODE.
 */

import { DEMO_MODE } from '../auth/demo';

/** Figma Home card (node 51:1719). */
export interface DemoHeroFigure {
  readonly label: string;
  readonly figure: string;
}

export const DEMO_HOME_BALANCE: DemoHeroFigure | null = DEMO_MODE
  ? { label: 'Available Balance', figure: '$500.89' }
  : null;

/** Figma "Debit Cards" card text (nodes 1036:4861/4862, 4885/4886, 4909/4910). */
export interface DemoCardText {
  readonly number: string;
  readonly amount: string;
}

export const DEMO_CARD_TEXT: Readonly<Record<'USD' | 'EUR' | 'NGN', DemoCardText>> | null = DEMO_MODE
  ? {
      USD: { number: '**** **** **** 4892', amount: '500.08 USD' },
      EUR: { number: '**** **** **** 4892', amount: '40.23 EUR' },
      NGN: { number: '**** **** **** 4892', amount: '45,783.83 NGN' },
    }
  : null;

/** Figma card transaction rows (frame 1019:12764). Display text only. */
export interface DemoCardTransaction {
  readonly id: string;
  readonly title: string;
  readonly date: string;
  readonly amount: string;
  readonly direction: 'out' | 'in';
  readonly icon: 'transfer' | 'stay' | 'design' | 'funded';
}

export const DEMO_CARD_TRANSACTIONS: readonly DemoCardTransaction[] = DEMO_MODE
  ? [
      { id: 'c1', title: 'Transfer to Adebayo', date: '12/05/2025', amount: '-$30', direction: 'out', icon: 'transfer' },
      { id: 'c2', title: 'Airbnb', date: '12/05/2025', amount: '-$120', direction: 'out', icon: 'stay' },
      { id: 'c3', title: 'Figma', date: '12/05/2025', amount: '-$45', direction: 'out', icon: 'design' },
      { id: 'c4', title: 'Card funded', date: '12/05/2025', amount: '+$260', direction: 'in', icon: 'funded' },
    ]
  : [];

/** Figma Home "Recent Transactions" rows (frame 55:1995), in Figma's order. */
export interface DemoHomeActivity {
  readonly id: string;
  readonly title: string;
  readonly amount: string;
  /** Card spend is shown in red, as in Figma. */
  readonly spend: boolean;
  readonly icon: 'swap' | 'shopping';
  readonly status: 'Completed' | 'Pending' | 'Failed';
  readonly when: string;
}

export const DEMO_HOME_ACTIVITY: readonly DemoHomeActivity[] = DEMO_MODE
  ? [
      { id: 'd1', title: 'NGN - USD', amount: '450,000', spend: false, icon: 'swap', status: 'Completed', when: '4:34 AM' },
      { id: 'd2', title: 'NGN - CAD', amount: '23,000', spend: false, icon: 'swap', status: 'Pending', when: '23/09/2024' },
      { id: 'd3', title: 'Shopping', amount: '67,000', spend: true, icon: 'shopping', status: 'Completed', when: '12/09/2024' },
      { id: 'd4', title: 'NGN - EUR', amount: '67,000', spend: false, icon: 'swap', status: 'Failed', when: '12/09/2024' },
      { id: 'd5', title: 'NGN - AUD', amount: '78,000', spend: false, icon: 'swap', status: 'Failed', when: '12/09/2024' },
    ]
  : [];

/** Shown on every demo figure. */
export const DEMO_BADGE = 'Demo';
