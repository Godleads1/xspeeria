/**
 * Transaction status pill, as drawn on the Figma Home frame (node 39:2882): a tinted pill
 * with a small glyph and the status word. Status is always carried by the word; tone and
 * glyph are extra. Tinted surface + status text colour pass AA (see token tests).
 */

import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { StatusTone } from '../../components/primitives';
import { color, typography } from '../../theme';

const TONE = {
  neutral: { surface: color.bg.sunken, text: color.text.secondary },
  success: { surface: color.success.surface, text: color.success.text },
  warning: { surface: color.warning.surface, text: color.warning.text },
  error: { surface: color.error.surface, text: color.error.text },
} as const;

function Glyph({ tone, tint }: { tone: StatusTone; tint: string }): ReactElement {
  const s = { stroke: tint, strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round' as const };
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12">
      <Circle cx={6} cy={6} r={5} {...s} />
      {tone === 'success' ? <Path d="M3.8 6.1 5.3 7.6 8.2 4.6" {...s} /> : null}
      {tone === 'warning' ? <Path d="M6 3.6V6l1.6 1" {...s} /> : null}
      {tone === 'error' ? <Path d="M4.4 4.4l3.2 3.2M7.6 4.4 4.4 7.6" {...s} /> : null}
    </Svg>
  );
}

export function StatusPill({ label, tone }: { label: string; tone: StatusTone }): ReactElement {
  const palette = TONE[tone];
  return (
    <View
      accessible
      accessibilityLabel={`Status: ${label}`}
      style={[styles.pill, { backgroundColor: palette.surface }]}
    >
      <Glyph tone={tone} tint={palette.text} />
      <Text numberOfLines={1} style={[styles.label, { color: palette.text }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  label: { ...typography.caption, fontSize: 11, lineHeight: 14 },
});
