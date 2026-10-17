/**
 * Home (Figma node 39:2882, as amended by DEC-008 / ADR-004).
 *
 * Order follows Figma: header -> best-rate card (the one primary action) -> current
 * market rates -> recent transactions, then Account Readiness (not in Figma; kept below
 * so the top of the screen matches the design).
 *
 * There is no balance region, no wallet identifier and no aggregate currency figure
 * under any condition. The hero shows a rate written with both currencies, never a lone
 * number. Account Readiness, absent from the Figma frame, is kept because it is the only
 * route to the steps a user must complete before trading.
 */

import type { ReactElement } from 'react';
import { View } from 'react-native';

import { ErrorState, LoadingState, Screen } from '../../components/primitives';
import type { ActivityItem, MarketRate, ReadinessDimension } from '../../fixtures';
import { space, themed } from '../../theme';
import { AccountReadiness } from './AccountReadiness';
import { ActivityList } from './ActivityList';
import { BestRateCard } from './BestRateCard';
import { HomeHeader } from './HomeHeader';
import { MarketRates } from './MarketRates';

export type HomeStatus = 'ready' | 'loading' | 'error';

export function HomeScreen({
  user = { name: 'David Peters', initials: 'DP' },
  bestRate,
  rates = [],
  dimensions,
  activity,
  status = 'ready',
  onRetry,
  onCreateOffer,
  onViewAll,
  onHelp,
  onNotifications,
}: {
  user?: { readonly name: string; readonly initials: string };
  bestRate?: MarketRate;
  rates?: readonly MarketRate[];
  dimensions: readonly ReadinessDimension[];
  activity: readonly ActivityItem[];
  status?: HomeStatus;
  onRetry?: () => void;
  onCreateOffer?: () => void;
  onViewAll?: () => void;
  onHelp?: () => void;
  onNotifications?: () => void;
}): ReactElement {
  return (
    <Screen testID="home-screen">
      <HomeHeader
        name={user.name}
        initials={user.initials}
        onHelp={onHelp}
        onNotifications={onNotifications}
      />

      {status === 'loading' ? <LoadingState label="Loading your account" /> : null}
      {status === 'error' ? (
        <ErrorState title="We could not load your account" onRetry={onRetry} />
      ) : null}

      {status === 'ready' ? (
        <View style={styles.body}>
          <View>
            {bestRate ? (
              <View style={styles.hero}>
                <BestRateCard rate={bestRate} onTrade={onCreateOffer} />
              </View>
            ) : null}
            {rates.length > 0 ? <MarketRates rates={rates} attached={bestRate !== undefined} /> : null}
          </View>
          <ActivityList items={activity} onCreateOffer={onCreateOffer} onViewAll={onViewAll} />
          <AccountReadiness dimensions={dimensions} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = themed(() => ({
  body: { gap: space.md },
  /** Keeps the hero card above the rates panel it overlaps. */
  hero: { zIndex: 1, elevation: 8 },
}));
