/**
 * Reusable UI primitives.
 *
 * Every visual value comes from the semantic token layer. No component names a colour,
 * a hue ramp or a font family directly.
 */

import type { ReactElement, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  brandTextStyle,
  color,
  interaction,
  numericTextStyle,
  radius,
  space,
  typography,
} from '../../theme';

/* ------------------------------------------------------------------ Screen */

/**
 * The screen container.
 *
 * Screens render their own header, so the top safe-area inset is applied here rather
 * than by a navigation header. Gutters are `space.lg` (32), the frozen screen-edge
 * margin (`docs/09-ui-ux/xspeeria-design-bible.md`, page 6). Rows that pair a label with
 * a status chip let the label column shrink and wrap; the chip never truncates.
 */
export function Screen({
  children,
  testID,
}: {
  children: ReactNode;
  testID?: string;
}): ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      testID={testID}
      style={styles.screen}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.screenContent, { paddingTop: insets.top + space.xs }]}
    >
      {children}
    </ScrollView>
  );
}

/* -------------------------------------------------------------------- Text */

export function Title({ children }: { children: ReactNode }): ReactElement {
  return (
    <Text accessibilityRole="header" style={[typography.title, styles.textPrimary]}>
      {children}
    </Text>
  );
}

export function SectionTitle({ children }: { children: ReactNode }): ReactElement {
  return (
    <Text accessibilityRole="header" style={[typography.sectionTitle, styles.textPrimary]}>
      {children}
    </Text>
  );
}

export function Headline({ children }: { children: ReactNode }): ReactElement {
  return <Text style={[typography.headline, styles.textPrimary]}>{children}</Text>;
}

export function Body({ children }: { children: ReactNode }): ReactElement {
  return <Text style={[typography.body, styles.textSecondary]}>{children}</Text>;
}

export function Caption({ children }: { children: ReactNode }): ReactElement {
  return <Text style={[typography.caption, styles.textSecondary]}>{children}</Text>;
}

/** Hairline rule inside a card. Grouping is spacing first; this is the fallback. */
export function Divider(): ReactElement {
  return <View style={styles.divider} />;
}

/* ------------------------------------------------------------------ Amount */

/**
 * The only component permitted to render a currency value.
 *
 * It takes integer minor units with an explicit scale — never a float — and applies the
 * numeric typography role so financial figures align in a column. Concentrating this in
 * one component is what keeps the tabular-figure rule enforceable.
 */
export function Amount({
  minor,
  currency,
  scale,
  label,
}: {
  minor: number;
  currency: string;
  scale: number;
  label?: string;
}): ReactElement {
  if (!Number.isInteger(minor)) {
    throw new Error('Amount requires integer minor units, never a float');
  }
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const divisor = 10 ** scale;
  const whole = Math.trunc(abs / divisor);
  const fraction = scale > 0 ? String(abs % divisor).padStart(scale, '0') : '';
  const rendered = `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''} ${currency}`;

  return (
    <Text
      accessibilityLabel={label ? `${label}: ${rendered}` : rendered}
      style={[typography.headline, numericTextStyle, styles.textPrimary]}
    >
      {rendered}
    </Text>
  );
}

/* ------------------------------------------------------------------ Button */

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  testID,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}): ReactElement {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        disabled
          ? { backgroundColor: interaction.primary.disabledFill }
          : { backgroundColor: pressed ? interaction.primary.pressed : interaction.primary.default },
      ]}
    >
      <Text
        style={[
          typography.headline,
          brandTextStyle,
          styles.buttonLabel,
          { color: disabled ? interaction.primary.disabledLabel : color.text.onFill },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}): ReactElement {
  return (
    <View testID={testID} style={[styles.card, style]}>
      {children}
    </View>
  );
}

/* -------------------------------------------------------------- StatusChip */

export type StatusTone = 'neutral' | 'success' | 'warning' | 'error';

const TONE = {
  neutral: { surface: color.bg.sunken, border: color.border.strong, text: color.text.secondary },
  success: { surface: color.success.surface, border: color.success.border, text: color.success.text },
  warning: { surface: color.warning.surface, border: color.warning.border, text: color.warning.text },
  error: { surface: color.error.surface, border: color.error.border, text: color.error.text },
} as const;

/**
 * Status is always carried by text, never by colour alone. The tone is additional
 * information, not the message.
 */
export function StatusChip({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: StatusTone;
}): ReactElement {
  const palette = TONE[tone];
  return (
    <View
      accessible
      accessibilityLabel={`Status: ${label}`}
      style={[styles.chip, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <Text numberOfLines={1} style={[typography.chipLabel, { color: palette.text }]}>
        {label}
      </Text>
    </View>
  );
}

/* --------------------------------------------------------------- States */

export function LoadingState({ label = 'Loading' }: { label?: string }): ReactElement {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={styles.state}>
      <ActivityIndicator color={color.brand.primary} />
      <Caption>{label}</Caption>
    </View>
  );
}

/**
 * Every empty state names a next action — no dead ends.
 *
 * `bg.sunken` carries only 1.05:1, so it is paired with a hairline and never used as the
 * sole separator. An empty state is one of its approved uses.
 */
export function EmptyState({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel: string;
  onAction?: () => void;
}): ReactElement {
  return (
    <View style={styles.emptyState}>
      <Headline>{title}</Headline>
      <View style={styles.emptyStateAction}>
        <PrimaryButton label={actionLabel} onPress={onAction} />
      </View>
    </View>
  );
}

export function ErrorState({
  title,
  onRetry,
}: {
  title: string;
  onRetry?: () => void;
}): ReactElement {
  return (
    <View
      accessibilityRole="alert"
      style={[styles.state, styles.errorState]}
    >
      <Text style={[typography.headline, { color: color.error.text }]}>{title}</Text>
      <PrimaryButton label="Try again" onPress={onRetry} testID="error-retry" />
    </View>
  );
}

/* ------------------------------------------------------------------ Styles */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  screenContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    gap: space.md,
  },
  textPrimary: { color: color.text.primary },
  textSecondary: { color: color.text.secondary },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.border.subtle,
  },
  button: {
    // 52 and `radius.lg` (24) are the frozen Primary Button specification
    // (`docs/09-ui-ux/xspeeria-design-bible.md`, page 19). 52 clears the 44pt touch
    // minimum.
    minHeight: 52,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { letterSpacing: 0.1 },
  card: {
    // Cards sit on the canvas with a hairline and generous padding, never raised
    // elevation, and never a card on a card.
    backgroundColor: color.bg.canvas,
    borderColor: color.border.subtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.sm,
    gap: space.xs,
  },
  chip: {
    // No `alignSelf` here: every row that holds a chip centres it on the cross axis, and
    // a hard `flex-start` top-aligned it against a two-line label. Column parents set
    // their own `alignItems`.
    borderWidth: 1,
    // 16 against a 26pt chip height reads as a pill; no new radius token is needed.
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  state: { gap: space.sm, paddingVertical: space.sm },
  emptyState: {
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    backgroundColor: color.bg.sunken,
    borderColor: color.border.subtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
  emptyStateAction: { alignSelf: 'stretch' },
  errorState: {
    backgroundColor: color.error.surface,
    borderColor: color.error.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
});
