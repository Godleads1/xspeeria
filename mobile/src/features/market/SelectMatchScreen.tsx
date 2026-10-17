/**
 * Select Match (Figma frame 106:1150), ADR-005.
 *
 * After "Create request" (or "Create Offer"): a summary of what was asked for, the amount
 * to pay worked out in exact integer arithmetic, the listings that match, and a red
 * "Cancel request" that returns to Market. MOCK DATA ONLY.
 */

import type { ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/icons';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { SectionLabel } from '../home/SectionLabel';
import { ListingRow, RoundButton } from './controls';
import { listingsFor, type Listing } from './data';
import { formatCompact, formatHundredths, quoteMinor } from './money';
import type { Side, TradeRequest } from './MarketScreen';

export function SelectMatchScreen({
  request,
  onBack,
  onCancel,
  onTakeListing,
}: {
  request: TradeRequest;
  onBack: () => void;
  onCancel: () => void;
  onTakeListing: (listing: Listing, side: Side) => void;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const payMinor = quoteMinor(request.amountMinor, request.rateHundredths);
  const matches = listingsFor(request.side, request.currency);
  const isBuy = request.side === 'buy';

  return (
    <View testID="select-match-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
      <View style={styles.header}>
        <Pressable
          testID="select-match-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={12}
          style={styles.back}
        >
          <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          Select Match
        </Text>
        <RoundButton icon="more" label="More options" />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View testID="select-match-summary" style={styles.summary}>
          <Text style={styles.summaryLine}>
            {'Amount: '}
            <Text style={styles.summaryStrong}>
              {`${formatCompact(request.amountMinor)} ${request.currency}`}
            </Text>
          </Text>
          <View style={styles.rule} />
          <Text style={styles.summaryLine}>
            {'Rate: '}
            <Text style={styles.summaryMuted}>NGN </Text>
            <Text style={styles.summaryStrong}>{formatCompact(request.rateHundredths)}</Text>
            <Text style={styles.summaryMuted}>{` /${request.currency}`}</Text>
          </Text>
          <View style={styles.rule} />
          <Text testID="select-match-pay" style={styles.summaryLine}>
            {isBuy ? 'Amount to pay: ' : 'Amount to receive: '}
            <Text style={styles.summaryStrong}>{`${formatHundredths(payMinor)} NGN`}</Text>
          </Text>
          <Text style={styles.summaryNote}>Paid into bank escrow, never to Xspeeria.</Text>
        </View>

        <SectionLabel>
          {matches.length > 0 ? 'We found some match for your request' : 'No match yet'}
        </SectionLabel>

        {matches.length === 0 ? (
          <Text style={styles.empty}>
            Your request stays open. We will notify you when someone matches it.
          </Text>
        ) : (
          <View>
            {matches.map((l) => (
              <ListingRow key={l.id} listing={l} side={request.side} onAction={(x) => onTakeListing(x, request.side)} />
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
        <Pressable
          testID="select-match-cancel"
          accessibilityRole="button"
          onPress={onCancel}
          style={({ pressed }) => [styles.cancel, pressed ? styles.cancelPressed : null]}
        >
          <Text style={styles.cancelLabel}>{isBuy ? 'Cancel request' : 'Cancel offer'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: space.xs,
  },
  back: { width: 36, height: 36, justifyContent: 'center' },
  title: { ...typography.headline, ...brandWeight('700'), color: color.text.primary },
  content: { paddingHorizontal: space.md, paddingBottom: space.lg, gap: space.sm },
  summary: {
    backgroundColor: color.bg.sunken,
    borderRadius: 16,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    alignItems: 'center',
    gap: 10,
  },
  summaryLine: { ...typography.caption, fontSize: 13, color: color.text.primary },
  summaryStrong: { ...brandWeight('700'), color: color.text.primary },
  summaryMuted: { color: color.text.secondary },
  summaryNote: { ...typography.caption, fontSize: 11, color: color.text.secondary },
  rule: { alignSelf: 'stretch', height: StyleSheet.hairlineWidth, backgroundColor: color.border.subtle },
  empty: { ...typography.body, color: color.text.secondary, textAlign: 'center', paddingVertical: space.md },
  footer: { paddingHorizontal: space.md, paddingTop: space.xs },
  cancel: {
    minHeight: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.error.fill,
  },
  cancelPressed: { opacity: 0.9 },
  // White on error.fill (#EF4444) is 3.76:1: label is large text (19 pt bold).
  cancelLabel: { ...brandWeight('700'), fontSize: 19, color: color.text.onFill },
}));
