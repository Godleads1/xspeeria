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
  Caption,
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

export type HomeStatus = 'ready' | 'loading' | 'error';

export function HomeScreen({
  greeting = 'Good morning',
  dimensions,
  activity,
  status = 'ready',
  onRetry,
  onCreateOffer,
}: {
  greeting?: string;
  dimensions: readonly ReadinessDimension[];
  activity: readonly ActivityItem[];
  status?: HomeStatus;
  onRetry?: () => void;
  onCreateOffer?: () => void;
}): ReactElement {
  return (
    <Screen testID="home-screen">
      <View style={styles.header}>
        <Title>{greeting}</Title>
        <Caption>Notifications are in the bell above</Caption>
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
          <SectionTitle>Active activity</SectionTitle>
          <ActivityList items={activity} onCreateOffer={onCreateOffer} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.xs },
});
