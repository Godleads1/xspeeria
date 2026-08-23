/**
 * Cards — COMING SOON.
 *
 * A real destination, never a dead or disabled tab. It explains the future feature and
 * carries a next action.
 *
 * It must expose no card functionality and no card balance, and must not imply
 * stored-value wallet or card functionality: `PRODUCT.md` commits that Xspeeria never
 * visually implies custody, card balances or banking services.
 */

import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { Body, Card, Caption, Screen, StatusChip, Title } from '../../components/primitives';
import { space } from '../../theme';

export function ComingSoonScreen(): ReactElement {
  return (
    <Screen testID="cards-screen">
      <View style={styles.header}>
        <Title>Cards</Title>
        <StatusChip label="Coming soon" tone="neutral" />
      </View>
      <Card testID="cards-explainer">
        <Body>
          Cards are not available yet. When they arrive you will be able to manage them here.
        </Body>
        <Caption>
          Xspeeria never holds your money. Cards will not be a wallet, and no balance is
          stored on your account.
        </Caption>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.xs },
});
