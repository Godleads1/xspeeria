/**
 * Home (Figma node 39:2882, as amended by DEC-008 / ADR-004).
 *
 * Order: header -> best-rate card (carries the one primary action) -> Account Readiness
 * -> current market rates -> recent transactions.
 *
 * There is no balance region, no wallet identifier and no aggregate currency figure
 * under any condition. The hero shows a rate written with both currencies, never a lone
 * number. Account Readiness, absent from the Figma frame, is kept because it is the only
 * route to the steps a user must complete before trading.
 */

import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorState, LoadingState, Screen } from '../../components/primitives';
import type { ActivityItem, MarketRate, ReadinessDimension } from '../../fixtures';
import { space } from '../../theme';
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
          {bestRate ? <BestRateCard rate={bestRate} onTrade={onCreateOffer} /> : null}
          <AccountReadiness dimensions={dimensions} />
          {rates.length > 0 ? <MarketRates rates={rates} /> : null}
          <ActivityList items={activity} onCreateOffer={onCreateOffer} onViewAll={onViewAll} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
});
