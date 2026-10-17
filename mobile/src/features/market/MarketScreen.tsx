/**
 * Market (Figma frames 79:399, 1019:11897 and 94:557 for Buy; 436:7771 for Sell), ADR-005.
 *
 * Buy: pick the currency to buy, the amount and the NGN rate you will pay → "Create
 * request"; below, sell offers you can take. Sell: the amount of foreign currency to
 * sell, the currency to receive and your rate → "Create Offer"; below, buy requests you
 * can fill. Xspeeria never holds the money: a match leads to bank escrow, not a balance.
 *
 * MOCK DATA ONLY. All amounts and rates are parsed to integers (`money.ts`); the server
 * must re-validate everything.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '../../components/icons';
import { Screen } from '../../components/primitives';
import { brandWeight, color, space, typography } from '../../theme';
import { SectionLabel } from '../home/SectionLabel';
import {
  BuySellToggle,
  CurrencyChip,
  CurrencySheet,
  FieldInput,
  ListingRow,
  OutlinedField,
  RoundButton,
} from './controls';
import {
  BUYABLE,
  MARKET_BAND,
  NGN,
  RECEIVABLE,
  listingsFor,
  type Currency,
  type Listing,
} from './data';
import { formatHundredths, matchPotential, parseToHundredths } from './money';

export type Side = 'buy' | 'sell';

export interface TradeRequest {
  readonly side: Side;
  /** Foreign currency code (what the buyer receives / the seller gives). */
  readonly currency: string;
  readonly amountMinor: number;
  readonly rateHundredths: number;
}

const SELL_CURRENCY = BUYABLE[0]; // Figma Sell frame: USD.

const ADVERT = require('../../../assets/images/market-advert.png');

export function MarketScreen({
  initialSide = 'buy',
  onCreate,
  onTakeListing,
}: {
  initialSide?: Side;
  onCreate?: (request: TradeRequest) => void;
  onTakeListing?: (listing: Listing, side: Side) => void;
}): ReactElement {
  const [side, setSide] = useState<Side>(initialSide);
  const [buyCurrency, setBuyCurrency] = useState<Currency | null>(null);
  const [receive, setReceive] = useState<Currency>(NGN);
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [sheet, setSheet] = useState(false);
  const [cheapestFirst, setCheapestFirst] = useState(true);

  const foreign = side === 'buy' ? buyCurrency : SELL_CURRENCY;
  const band = foreign ? MARKET_BAND[foreign.code] : undefined;
  const amountMinor = parseToHundredths(amount);
  const rateHundredths = parseToHundredths(rate);
  const potential =
    band && rateHundredths !== null ? matchPotential(side, rateHundredths, band) : null;
  const ready = foreign !== null && amountMinor !== null && rateHundredths !== null;

  const listings = useMemo(() => {
    if (!foreign) return [];
    const list = listingsFor(side, foreign.code);
    return cheapestFirst ? list : [...list].reverse();
  }, [side, foreign, cheapestFirst]);

  const switchSide = (next: Side): void => {
    setSide(next);
    setAmount('');
    setRate('');
  };

  const create = (): void => {
    if (!ready || !foreign || amountMinor === null || rateHundredths === null) return;
    onCreate?.({ side, currency: foreign.code, amountMinor, rateHundredths });
  };

  const take = (listing: Listing): void => {
    if (onTakeListing) onTakeListing(listing, side);
    else
      Alert.alert(
        side === 'buy' ? 'Buy this offer' : 'Fill this request',
        'Confirming a trade is the next screen to be built. Nothing has been sent.',
      );
  };

  const trendText = band && foreign
    ? `Current Market Trend:  ${formatHundredths(band.low)} - ${formatHundredths(band.high)} NGN = 1 ${foreign.code}`
    : 'Current Market Trend:  -----------';

  const amountField = (
    <OutlinedField
      label={side === 'buy' ? `Amount in “${foreign?.code ?? 'USD'}” *` : `Amount in “${SELL_CURRENCY.code}” to sell *`}
    >
      <FieldInput
        testID="market-amount"
        accessibilityLabel={`Amount in ${foreign?.code ?? 'USD'}`}
        value={amount}
        onChangeText={setAmount}
      />
    </OutlinedField>
  );

  const currencyField = (
    <OutlinedField label={side === 'buy' ? 'Select Currency to buy *' : 'Select Currency to Receive *'}>
      <Pressable
        testID="market-currency"
        accessibilityRole="button"
        accessibilityLabel={side === 'buy' ? 'Select currency to buy' : 'Select currency to receive'}
        onPress={() => setSheet(true)}
        style={styles.select}
      >
        {side === 'buy' && buyCurrency ? (
          <Text style={styles.selectValue}>{`${buyCurrency.flag}  ${buyCurrency.code}`}</Text>
        ) : side === 'sell' ? (
          <Text style={styles.selectValue}>{`${receive.flag}  ${receive.code}`}</Text>
        ) : (
          <Text style={styles.selectPlaceholder}> </Text>
        )}
        <Icon name="caret" color={color.text.secondary} size={22} />
      </Pressable>
    </OutlinedField>
  );

  return (
    <Screen testID="marketplace-screen">
      <View style={styles.header}>
        <BuySellToggle side={side} onChange={switchSide} />
        <View style={styles.headerActions}>
          <CurrencyChip currency={side === 'buy' ? NGN : SELL_CURRENCY} />
          <RoundButton icon="bell" label="Notifications" testID="market-notifications" />
          <RoundButton icon="more" label="More options" testID="market-more" />
        </View>
      </View>

      <View style={styles.form}>
        {side === 'buy' ? currencyField : amountField}
        {side === 'buy' ? amountField : currencyField}

        <View style={styles.trend}>
          <Text testID="market-trend" style={styles.trendText}>
            {trendText}
          </Text>
          {band ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                Alert.alert(
                  'Current market trend',
                  'The range of rates in recent matched trades on Xspeeria. Rates inside it are more likely to find a match. Illustrative data.',
                )
              }
              hitSlop={8}
              style={styles.details}
            >
              <Icon name="info" color={color.error.text} size={14} />
              <Text style={styles.detailsText}>See Details</Text>
            </Pressable>
          ) : null}
        </View>

        <OutlinedField label="Rate *">
          <FieldInput
            testID="market-rate"
            accessibilityLabel={`Rate in NGN per ${foreign?.code ?? 'unit'}`}
            value={rate}
            onChangeText={setRate}
            trailing={
              potential !== null ? (
                <View
                  testID="market-potential"
                  style={[styles.potential, potential >= 50 ? styles.potentialGood : styles.potentialLow]}
                >
                  <Text
                    style={[
                      styles.potentialText,
                      { color: potential >= 50 ? color.success.text : color.error.text },
                    ]}
                  >
                    {`${potential}% Match Potential`}
                  </Text>
                </View>
              ) : null
            }
          />
        </OutlinedField>

        <Pressable
          testID="market-create"
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready || !onCreate }}
          disabled={!ready || !onCreate}
          onPress={create}
          style={({ pressed }) => [
            styles.create,
            { backgroundColor: side === 'buy' ? color.brand.primary : color.trade.sell },
            !ready || !onCreate ? styles.createDisabled : null,
            pressed ? styles.createPressed : null,
          ]}
        >
          <Text style={styles.createLabel}>{side === 'buy' ? 'Create request' : 'Create Offer'}</Text>
        </Pressable>
      </View>

      <View style={styles.listHeader}>
        <SectionLabel>
          {side === 'buy' ? 'Available offers' : `Available ${SELL_CURRENCY.code} request`}
        </SectionLabel>
        <Pressable
          testID="market-sort"
          accessibilityRole="button"
          accessibilityLabel={cheapestFirst ? 'Sorted by best rate. Reverse order' : 'Reversed. Sort by best rate'}
          onPress={() => setCheapestFirst((v) => !v)}
          hitSlop={10}
        >
          <Icon name="sort" color={color.text.primary} size={22} />
        </Pressable>
      </View>

      {listings.length === 0 ? (
        <Text testID="market-empty" style={styles.empty}>
          {foreign
            ? `No ${side === 'buy' ? 'offers' : 'requests'} for ${foreign.code} right now`
            : 'Select a currency to buy to see available offers'}
        </Text>
      ) : (
        <View testID="market-listings">
          {listings.map((l) => (
            <ListingRow key={l.id} listing={l} side={side} onAction={take} />
          ))}
        </View>
      )}

      {side === 'buy' ? (
        <View testID="market-advert" style={styles.advert}>
          {/* Figma advert slot (node 787:4204). PLACEHOLDER artwork supplied by the product
              owner; the stock photo needs a confirmed licence before release. */}
          <Image
            source={ADVERT}
            accessibilityLabel="Place advert here"
            resizeMode="cover"
            style={styles.advertImage}
          />
        </View>
      ) : null}

      <CurrencySheet
        visible={sheet}
        title={side === 'buy' ? 'Currencies you can buy' : 'Currencies you are licensed to receive'}
        currencies={side === 'buy' ? BUYABLE : RECEIVABLE}
        onClose={() => setSheet(false)}
        onSelect={(c) => {
          if (side === 'buy') setBuyCurrency(c);
          else setReceive(c);
          setSheet(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  form: { gap: space.sm },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  selectValue: { ...typography.body, fontSize: 17, color: color.text.primary },
  selectPlaceholder: { ...typography.body },
  trend: { alignItems: 'flex-end', gap: 4, marginTop: -6 },
  trendText: { ...typography.caption, fontSize: 11, color: color.text.secondary },
  details: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailsText: { ...typography.caption, fontSize: 11, color: color.error.text },
  potential: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4 },
  potentialGood: { backgroundColor: color.success.surface },
  potentialLow: { backgroundColor: color.error.surface },
  potentialText: { ...typography.caption, fontSize: 10, lineHeight: 12 },
  create: {
    minHeight: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: color.bg.inverse,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  // Figma's disabled "Create request" is the same button faded; the label stays readable.
  createDisabled: { opacity: 0.5, elevation: 0, shadowOpacity: 0 },
  createPressed: { opacity: 0.9 },
  // 19 pt bold: large text, so white also passes on the Sell green (4.37:1).
  createLabel: { ...brandWeight('700'), fontSize: 19, color: color.text.onFill },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border.subtle,
  },
  empty: {
    ...typography.caption,
    fontSize: 13,
    color: color.text.disabled,
    textAlign: 'center',
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
  },
  // Figma: 342 × 100, radius 10, 1 pt #9CA3AF border.
  advert: {
    aspectRatio: 342 / 100,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.text.disabled,
    backgroundColor: color.trade.advert,
    overflow: 'hidden',
  },
  advertImage: { width: '100%', height: '100%' },
});
