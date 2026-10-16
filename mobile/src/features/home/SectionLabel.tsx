/**
 * The small uppercase section heading used on the Figma Home frame
 * ("CURRENT MARKET RATES", "RECENT TRANSACTIONS"). Still announced as a header.
 */

import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { color, typography } from '../../theme';

export function SectionLabel({ children }: { children: ReactNode }): ReactElement {
  return (
    <Text accessibilityRole="header" style={styles.label}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.chipLabel,
    color: color.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
