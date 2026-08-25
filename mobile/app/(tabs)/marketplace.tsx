import type { ReactElement } from 'react';
import { PlaceholderScreen } from '../../src/features/shared/PlaceholderScreen';

/**
 * No filtering exists yet, so the screen offers no "Clear filters". Inventing a filter
 * control to satisfy the empty-state pattern would promise behaviour the milestone does
 * not have; the message stands on its own until the marketplace is built.
 */
export default function MarketplaceRoute(): ReactElement {
  return (
    <PlaceholderScreen
      testID="marketplace-screen"
      title="Marketplace"
      message="Offers arrive in a later milestone"
    />
  );
}
