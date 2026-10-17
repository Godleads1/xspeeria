/**
 * Bottom navigation: Home · Market · History · Cards · Profile.
 * Human-approved 2026-08-22; labels and order amended by DEC-005 (2026-10-16) to match the
 * Figma mobile navigation. The `marketplace` route keeps its path; only the label is short.
 *
 * Notifications are deliberately NOT a bottom-navigation destination: they are reached
 * through the bell, the notification centre and push. `cards` is COMING SOON and opens
 * a real destination — never a dead or disabled tab.
 */

export type TabName = 'index' | 'marketplace' | 'history' | 'cards' | 'profile';

export interface TabDefinition {
  readonly name: TabName;
  readonly title: string;
  /**
   * Announced to screen readers as "coming soon". No visual badge on the tab (Figma has
   * none, and it truncated); the destination screen says it. Still fully interactive.
   */
  readonly comingSoon?: boolean;
}

export const TABS: readonly TabDefinition[] = [
  { name: 'index', title: 'Home' },
  { name: 'marketplace', title: 'Market' },
  { name: 'history', title: 'History' },
  { name: 'cards', title: 'Cards', comingSoon: true },
  { name: 'profile', title: 'Profile' },
] as const;
