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

export function Screen({
  children,
  testID,
}: {
  children: ReactNode;
  testID?: string;
}): ReactElement {
  return (
    <ScrollView
      testID={testID}
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
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
      <Text style={[typography.caption, { color: palette.text }]}>{label}</Text>
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

/** Every empty state names a next action — no dead ends. */
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
    <View style={styles.state}>
      <Headline>{title}</Headline>
      <PrimaryButton label={actionLabel} onPress={onAction} />
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
  screenContent: { padding: space.sm, gap: space.md },
  textPrimary: { color: color.text.primary },
  textSecondary: { color: color.text.secondary },
  button: {
    minHeight: 52,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    // Cards sit on the canvas with a hairline and padding, never raised elevation,
    // and never a card on a card.
    backgroundColor: color.bg.canvas,
    borderColor: color.border.subtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.sm,
    gap: space.xs,
  },
  chip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.xs,
    paddingVertical: 4,
  },
  state: { gap: space.sm, paddingVertical: space.md },
  errorState: {
    backgroundColor: color.error.surface,
    borderColor: color.error.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.sm,
  },
});
