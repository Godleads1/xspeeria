/**
 * Home.
 *
 * Approved hierarchy: header -> Account Readiness -> primary action -> active activity
 * -> recent activity. There is no balance region, no wallet identifier and no aggregate
 * currency hero under any condition.
 */

import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Body,
  ErrorState,
  LoadingState,
  PrimaryButton,
  Screen,
  SectionTitle,
  Title,
} from '../../components/primitives';
import type { ActivityItem, ReadinessDimension } from '../../fixtures';
import { space } from '../../theme';
import { AccountReadiness } from './AccountReadiness';
import { ActivityList } from './ActivityList';
import { HomeHeader } from './HomeHeader';

export type HomeStatus = 'ready' | 'loading' | 'error';

export function HomeScreen({
  greeting = 'Good morning',
  dimensions,
  activity,
  status = 'ready',
  onRetry,
  onCreateOffer,
  onNotifications,
}: {
  greeting?: string;
  dimensions: readonly ReadinessDimension[];
  activity: readonly ActivityItem[];
  status?: HomeStatus;
  onRetry?: () => void;
  onCreateOffer?: () => void;
  onNotifications?: () => void;
}): ReactElement {
  return (
    <Screen testID="home-screen">
      <View style={styles.top}>
        <HomeHeader onNotifications={onNotifications} />
        <View style={styles.greeting}>
          <Title>{greeting}</Title>
          <Body>Here is what needs your attention.</Body>
        </View>
      </View>

      {status === 'loading' ? <LoadingState label="Loading your account" /> : null}
      {status === 'error' ? (
        <ErrorState title="We could not load your account" onRetry={onRetry} />
      ) : null}

      {status === 'ready' ? (
        <>
          <AccountReadiness dimensions={dimensions} />
          <PrimaryButton
            label="Create or browse an offer"
            onPress={onCreateOffer}
            testID="home-primary-action"
          />
          <View style={styles.section}>
            <SectionTitle>Active activity</SectionTitle>
            <ActivityList items={activity} onCreateOffer={onCreateOffer} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** Header bar and greeting are one block; the screen gap below it is `space.md`. */
  top: { gap: space.md },
  greeting: { gap: 4 },
  section: { gap: space.sm },
});
