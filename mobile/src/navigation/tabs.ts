/**
 * Bottom navigation, human-approved 2026-08-22.
 *
 * Notifications are deliberately NOT a bottom-navigation destination: they are reached
 * through the bell, the notification centre and push. `cards` is COMING SOON and opens
 * a real destination — never a dead or disabled tab.
 */

export type TabName = 'index' | 'marketplace' | 'track' | 'cards' | 'profile';

export interface TabDefinition {
  readonly name: TabName;
  readonly title: string;
  /** Rendered as a badge on the tab; the destination is still fully interactive. */
  readonly comingSoon?: boolean;
}

export const TABS: readonly TabDefinition[] = [
  { name: 'index', title: 'Home' },
  { name: 'marketplace', title: 'Marketplace' },
  { name: 'track', title: 'Track' },
  { name: 'cards', title: 'Cards', comingSoon: true },
  { name: 'profile', title: 'Profile' },
] as const;
