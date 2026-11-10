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
 *
 * Exact-Figma demo (ADR-023, development builds only): the route can pass Figma's balance
 * card and transaction rows from `src/features/demo/figmaDemo.ts`, marked "Demo", and hide
 * Account Readiness so the screen matches the design. Release builds never receive them.
 */

import type { ReactElement } from 'react';
import { View } from 'react-native';

import { ErrorState, LoadingState, Screen } from '../../components/primitives';
import type { ActivityItem, MarketRate, ReadinessDimension } from '../../fixtures';
import { space, themed } from '../../theme';
import { AccountReadiness } from './AccountReadiness';
import { ActivityList } from './ActivityList';
import type { DemoHeroFigure, DemoHomeActivity } from '../demo/figmaDemo';
import { DEMO_BADGE } from '../demo/figmaDemo';
import { BestRateCard, HeroCard } from './BestRateCard';
import { FigmaActivityList } from './FigmaActivityList';
import { HomeHeader } from './HomeHeader';
import { HomeSearchBar, type HomeSearch } from './HomeSearchBar';
import { MarketRates } from './MarketRates';
import { ServiceNotices } from './ServiceNotices';
import type { ServiceNotice } from '../../api/noticesApi';
import { tr } from "../../i18n";

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
  unread = 0,
  demoHero = null,
  demoActivity = [],
  showReadiness = true,
  onSearch,
  offered,
  notices = [],
}: {
  user?: { readonly name: string; readonly initials: string; readonly avatarUri?: string | null };
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
  /** Unread notifications for the bell (ADR-044). */
  unread?: number;
  /** Figma's demo balance card (development builds only, ADR-023). */
  demoHero?: DemoHeroFigure | null;
  /** Figma's demo transaction rows (development builds only, ADR-023). */
  demoActivity?: readonly DemoHomeActivity[];
  showReadiness?: boolean;
  /** ADR-059: "Find a deal" under the header. Server builds only (search needs the server). */
  onSearch?: (s: HomeSearch) => void;
  /** Currencies the server offers now, for the search chips (server builds). */
  offered?: ReadonlySet<string> | null;
  /** ADR-066: outage notices from staff; shown first while they last. Server builds only. */
  notices?: readonly ServiceNotice[];
}): ReactElement {
  return (
    <Screen testID="home-screen">
      <HomeHeader
        name={user.name}
        initials={user.initials}
        avatarUri={user.avatarUri ?? null}
        onHelp={onHelp}
        onNotifications={onNotifications}
        unread={unread}
      />

      {status === 'loading' ? <LoadingState label={tr("Loading your account")} /> : null}
      {status === 'error' ? (
        <ErrorState title={tr("We could not load your account")} onRetry={onRetry} />
      ) : null}

      {status === 'ready' ? (
        <View style={styles.body}>
          <ServiceNotices notices={notices} />
          {onSearch ? <HomeSearchBar onSearch={onSearch} offered={offered} /> : null}
          <View>
            {demoHero ? (
              <View style={styles.hero}>
                <HeroCard
                  testID="home-demo-balance"
                  label={demoHero.label}
                  figure={demoHero.figure}
                  badge={DEMO_BADGE}
                  accessibilityLabel={tr("{{label}}: {{figure}}. Demo figure, not real money", { label: demoHero.label, figure: demoHero.figure })}
                />
              </View>
            ) : bestRate ? (
              <View style={styles.hero}>
                <BestRateCard rate={bestRate} onTrade={onCreateOffer} />
              </View>
            ) : null}
            {rates.length > 0 ? <MarketRates rates={rates} attached={demoHero !== null || bestRate !== undefined} /> : null}
          </View>
          {demoActivity.length > 0 ? (
            <FigmaActivityList items={demoActivity} onViewAll={onViewAll} />
          ) : (
            <ActivityList items={activity} onCreateOffer={onCreateOffer} onViewAll={onViewAll} />
          )}
          {showReadiness ? <AccountReadiness dimensions={dimensions} /> : null}
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
