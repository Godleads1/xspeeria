/**
 * Market controls, drawn after the Figma Market frames (ADR-005): outlined fields with a
 * notched floating label, the Buy/Sell segmented pill, the currency sheet, round header
 * buttons and the listing row.
 */

import type { ReactElement, ReactNode } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";

import { RoundFlag } from "../../components/flags";
import { Icon, type IconName } from "../../components/icons";
import {
  brandWeight,
  color,
  numericTextStyle,
  space,
  typography,
  themed,
} from "../../theme";
import type { Currency, Listing } from "./data";
import { formatCompact, formatHundredths } from "./money";

/* ------------------------------------------------------------ Outlined field */

/** Figma: 56 pt tall, 1 pt `#4B5563` border, radius 4, label notched into the top border. */
export function OutlinedField({
  label,
  children,
  invalid = false,
}: {
  label: string;
  children: ReactNode;
  invalid?: boolean;
}): ReactElement {
  return (
    <View style={[styles.field, invalid ? styles.fieldInvalid : null]}>
      <View style={styles.notch} pointerEvents="none">
        <Text style={[styles.notchLabel, invalid ? styles.invalidText : null]}>
          {label}
        </Text>
      </View>
      {children}
    </View>
  );
}

export function FieldInput({
  value,
  onChangeText,
  placeholder = "enter",
  keyboardType = "decimal-pad",
  testID,
  accessibilityLabel,
  trailing,
  maxLength = 16,
  inputMode = "decimal",
  secure = false,
  noAutofill = false,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  inputMode?: "decimal" | "numeric" | "text";
  /** Password entry: masked, no autocorrect/capitalisation. */
  secure?: boolean;
  /**
   * Masked identity numbers (e.g. SSN): never offered to a password manager or autofill,
   * so the OS does not ask to save them as a password (SEC-12).
   */
  noAutofill?: boolean;
  testID?: string;
  accessibilityLabel: string;
  trailing?: ReactNode;
}): ReactElement {
  return (
    <View style={styles.inputRow}>
      <TextInput
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.text.disabled}
        keyboardType={keyboardType}
        inputMode={inputMode}
        maxLength={maxLength}
        secureTextEntry={secure}
        autoCapitalize={secure ? "none" : undefined}
        autoCorrect={secure ? false : undefined}
        textContentType={noAutofill ? "none" : secure ? "password" : undefined}
        autoComplete={noAutofill ? "off" : undefined}
        importantForAutofill={noAutofill ? "no" : undefined}
        style={styles.input}
      />
      {trailing}
    </View>
  );
}

/* ----------------------------------------------------------- Segmented pill */

export function BuySellToggle({
  side,
  onChange,
}: {
  side: "buy" | "sell";
  onChange: (next: "buy" | "sell") => void;
}): ReactElement {
  const option = (value: "buy" | "sell", label: string): ReactElement => {
    const selected = side === value;
    const tint = value === "buy" ? color.brand.primary : color.trade.sell;
    return (
      <Pressable
        testID={`market-${value}`}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        onPress={() => onChange(value)}
        style={[
          styles.segment,
          selected
            ? {
                backgroundColor:
                  value === "buy" ? color.bg.sunken : color.trade.sellSurface,
              }
            : null,
        ]}
      >
        <Text
          style={[
            styles.segmentLabel,
            selected ? { ...brandWeight("700"), color: tint } : null,
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };
  return (
    <View accessibilityRole="tablist" style={styles.toggle}>
      {option("buy", "Buy")}
      {option("sell", "Sell")}
    </View>
  );
}

/* ----------------------------------------------------------- Header buttons */

export function RoundButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  testID?: string;
}): ReactElement {
  const available = onPress !== undefined;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !available }}
      disabled={!available}
      onPress={onPress}
      style={({ pressed }) => [
        styles.round,
        pressed ? styles.roundPressed : null,
      ]}
    >
      <Icon
        name={icon}
        color={available ? color.text.primary : color.text.disabled}
        size={18}
      />
    </Pressable>
  );
}

export function CurrencyChip({
  currency,
}: {
  currency: Currency;
}): ReactElement {
  return (
    <View
      accessible
      accessibilityLabel={`Paying in ${currency.name}`}
      style={styles.chip}
    >
      <RoundFlag code={currency.code} size={20} />
      <Text style={styles.chipCode}>{currency.code}</Text>
    </View>
  );
}

/* ----------------------------------------------------------- Currency sheet */

/** Figma sheet (node 1019:9284): a titled list of currencies and a red Cancel. */
export function CurrencySheet({
  visible,
  title,
  currencies,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  currencies: readonly Currency[];
  onSelect: (currency: Currency) => void;
  onClose: () => void;
}): ReactElement {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessibilityLabel="Close"
      />
      <View style={styles.sheet}>
        <View style={styles.sheetGroup}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {currencies.map((c) => (
            <Pressable
              key={c.code}
              testID={`currency-${c.code}`}
              accessibilityRole="button"
              onPress={() => onSelect(c)}
              style={({ pressed }) => [
                styles.sheetRow,
                pressed ? styles.roundPressed : null,
              ]}
            >
              <RoundFlag code={c.code} size={26} />
              <Text
                style={styles.sheetRowLabel}
              >{`${c.name} (${c.code})`}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={styles.sheetCancel}
        >
          <Text style={styles.sheetCancelLabel}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------- Action sheet */

export interface SheetAction {
  readonly key: string;
  readonly label: string;
  /** Muted suffix, e.g. "(Buy)". */
  readonly hint?: string;
  readonly onPress: () => void;
}

/** Figma Market ⋮ menu: a rounded group of centred actions and a separate red Cancel. */
export function ActionSheet({
  visible,
  actions,
  onClose,
  testID,
}: {
  visible: boolean;
  actions: readonly SheetAction[];
  onClose: () => void;
  testID?: string;
}): ReactElement {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessibilityLabel="Close menu"
      />
      <View testID={testID} style={styles.sheet}>
        <View style={styles.sheetGroup}>
          {actions.map((a, i) => (
            <Pressable
              key={a.key}
              testID={`${testID ?? "sheet"}-${a.key}`}
              accessibilityRole="button"
              onPress={a.onPress}
              style={({ pressed }) => [
                styles.actionRow,
                i < actions.length - 1 ? styles.actionDivider : null,
                pressed ? styles.roundPressed : null,
              ]}
            >
              <Text style={styles.actionLabel}>
                {a.label}
                {a.hint ? (
                  <Text style={styles.actionHint}>{` ${a.hint}`}</Text>
                ) : null}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          testID={`${testID ?? "sheet"}-cancel`}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.sheetCancel}
        >
          <Text style={styles.sheetCancelLabel}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/* -------------------------------------------------------------- Listing row */

/** Figma offer row: amount available, rate, meta line, optional "Best" pill, action. */
export function ListingRow({
  listing,
  side,
  onAction,
  number,
  availableMinor = listing.availableMinor,
  takingMinor,
}: {
  listing: Listing;
  side: "buy" | "sell";
  onAction: (listing: Listing) => void;
  /** Figma sell Select Match numbers each match (1, 2, 3…) in a small green badge. */
  number?: number;
  /** What is still left on the listing (live trades already took the rest). */
  availableMinor?: number;
  /** Set when this listing is part of the user's selection: the amount taken from it. */
  takingMinor?: number;
}): ReactElement {
  const selected = takingMinor !== undefined;
  const taken = !selected && availableMinor <= 0;
  const action = selected ? "Remove" : taken ? "Taken" : side === "buy" ? "Buy" : "Sell";
  const tint = taken ? color.text.disabled : side === "buy" ? color.brand.primary : color.trade.sell;
  return (
    <View testID={`listing-${listing.id}`} style={[styles.listing, selected ? styles.listingSelected : null]}>
      {number !== undefined ? (
        <View
          testID={`listing-${listing.id}-number`}
          style={styles.numberBadge}
        >
          <Text style={styles.numberText}>{number}</Text>
        </View>
      ) : null}
      <View style={styles.listingMain}>
        <Text style={styles.listingLine}>
          {"Amount available: "}
          <Text style={styles.listingStrong}>
            {`${formatCompact(availableMinor)} ${listing.currency}`}
          </Text>
        </Text>
        <View style={styles.rateRow}>
          <Text style={styles.listingLine}>
            {"Rate: "}
            <Text style={styles.listingMuted}>NGN </Text>
            <Text style={styles.listingRate}>
              {formatCompact(listing.rateHundredths)}
            </Text>
            <Text style={styles.listingMuted}>{` /${listing.currency}`}</Text>
          </Text>
          {listing.best ? (
            <View style={styles.bestPill}>
              <Text style={styles.bestLabel}>
                {side === "buy" ? "Best Offer" : "Best Deal"}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.listingMeta}>{listing.meta}</Text>
        {selected ? (
          <Text testID={`listing-${listing.id}-taking`} style={styles.listingTaking}>
            {`Taking ${formatHundredths(takingMinor)} ${listing.currency}`}
          </Text>
        ) : null}
      </View>
      <Pressable
        testID={`listing-${listing.id}-action`}
        accessibilityRole="button"
        accessibilityLabel={
          selected
            ? `Remove ${formatHundredths(takingMinor)} ${listing.currency} at ${formatHundredths(listing.rateHundredths)} NGN from your selection`
            : `${action} ${formatHundredths(availableMinor)} ${listing.currency} at ${formatHundredths(listing.rateHundredths)} NGN`
        }
        accessibilityState={{ selected, disabled: taken }}
        disabled={taken}
        onPress={() => onAction(listing)}
        style={({ pressed }) => [
          styles.listingAction,
          side === "sell" ? styles.listingActionSell : null,
          pressed ? styles.roundPressed : null,
        ]}
      >
        <Text style={[styles.listingActionLabel, { color: tint }]}>
          {action}
        </Text>
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ Styles */

const ROUND = 36;

const styles = themed(() => ({
  field: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: color.border.strong,
    borderRadius: 4,
    justifyContent: "center",
    paddingLeft: space.sm,
    paddingRight: 8,
  },
  fieldInvalid: { borderColor: color.error.border },
  notch: {
    position: "absolute",
    top: -9,
    left: 12,
    paddingHorizontal: 4,
    backgroundColor: color.bg.canvas,
  },
  notchLabel: { ...typography.caption, color: color.text.primary },
  invalidText: { color: color.error.text },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    ...typography.body,
    ...numericTextStyle,
    fontSize: 17,
    color: color.text.primary,
    paddingVertical: 12,
  },

  toggle: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: 30,
    padding: 5,
    gap: 8,
  },
  segment: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 30 },
  segmentLabel: {
    ...typography.body,
    fontSize: 17,
    color: color.text.secondary,
  },

  round: {
    width: ROUND,
    height: ROUND,
    borderRadius: ROUND / 2,
    borderWidth: 1,
    borderColor: color.border.subtle,
    alignItems: "center",
    justifyContent: "center",
  },
  roundPressed: { backgroundColor: color.bg.sunken },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: ROUND,
    paddingHorizontal: 10,
    borderRadius: ROUND / 2,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  chipCode: {
    ...typography.caption,
    ...brandWeight("500"),
    color: color.text.primary,
  },

  scrim: { flex: 1, backgroundColor: color.bg.overlay },
  sheet: {
    padding: 10,
    gap: 8,
    backgroundColor: "transparent",
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 16,
  },
  sheetGroup: {
    backgroundColor: color.bg.canvas,
    borderRadius: 16,
    overflow: "hidden",
  },
  sheetTitle: {
    ...typography.body,
    color: color.text.secondary,
    textAlign: "center",
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
  sheetRowLabel: {
    ...typography.body,
    fontSize: 17,
    color: color.text.primary,
  },
  sheetCancel: {
    backgroundColor: color.bg.canvas,
    borderRadius: 16,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCancelLabel: {
    ...typography.body,
    fontSize: 17,
    color: color.error.text,
  },

  actionRow: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 20,
  },
  actionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
  actionLabel: { ...typography.body, fontSize: 17, color: color.text.primary },
  actionHint: { color: color.text.disabled },

  listing: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
  listingMain: { flex: 1, gap: 6 },
  rateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  listingLine: { ...typography.caption, color: color.text.primary },
  listingStrong: { ...brandWeight("700"), color: color.text.primary },
  listingMuted: { color: color.text.secondary },
  listingRate: {
    ...typography.body,
    ...brandWeight("700"),
    fontSize: 16,
    color: color.text.primary,
  },
  listingMeta: { ...typography.caption, color: color.text.secondary },
  listingTaking: { ...typography.caption, ...brandWeight("700"), color: color.text.primary },
  // Selected for a multi-offer fill: light brand tint, like a pill (navy on it ≈ 10.8:1).
  listingSelected: { backgroundColor: color.brand.tint, borderRadius: 12, paddingHorizontal: space.xs },
  bestPill: {
    backgroundColor: color.success.surface,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  bestLabel: {
    ...typography.caption,
    fontSize: 10,
    lineHeight: 12,
    color: color.success.text,
  },
  listingAction: {
    minWidth: 64,
    minHeight: 44,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.sunken,
  },
  listingActionSell: { backgroundColor: color.trade.sellSurface },
  numberBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: color.trade.sellSurface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    alignSelf: "center",
  },
  numberText: {
    ...typography.caption,
    fontSize: 11,
    color: color.success.text,
  },
  listingActionLabel: { ...typography.rowLabel },
}));
