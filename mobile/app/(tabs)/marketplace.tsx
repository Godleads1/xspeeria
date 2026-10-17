import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { MarketScreen } from '../../src/features/market/MarketScreen';

/** Market tab (ADR-005). Mock data only; "Create" opens Select Match. */
export default function MarketplaceRoute(): ReactElement {
  const router = useRouter();
  return (
    <MarketScreen
      onCreate={(req) =>
        router.push({
          pathname: '/market/matches',
          params: {
            side: req.side,
            currency: req.currency,
            amount: String(req.amountMinor),
            rate: String(req.rateHundredths),
          },
        })
      }
    />
  );
}
