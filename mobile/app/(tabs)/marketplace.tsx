import type { ReactElement } from 'react';
import { PlaceholderScreen } from '../../src/features/shared/PlaceholderScreen';

export default function MarketplaceRoute(): ReactElement {
  return (
    <PlaceholderScreen
      testID="marketplace-screen"
      title="Marketplace"
      message="No offers match your filters"
      actionLabel="Clear filters"
    />
  );
}
