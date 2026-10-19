/**
 * Recent transactions exactly as the Figma Home frame draws them (node 55:1995): a light
 * circle with the swap (or shopping) glyph, title over amount, status chip over time, and an
 * inset hairline between rows. Used in development builds for exact design review (ADR-023);
 * the rows come from `src/features/demo/figmaDemo.ts` and are display text only.
 */

import { Fragment, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '../../components/icons';
import { brandWeight, color, numericTextStyle, space, themed, typography } from '../../theme';
import { DEMO_BADGE, type DemoHomeActivity } from '../demo/figmaDemo';
import { SectionLabel } from './SectionLabel';
import { StatusPill } from './StatusPill';
import { tr } from "../../i18n";

const TONE = { Completed: 'success', Pending: 'warning', Failed: 'error' } as const;

export function FigmaActivityList({
  items,
  onViewAll,
}: {
  items: readonly DemoHomeActivity[];
  onViewAll?: () => void;
}): ReactElement {
  return (
    <View testID="home-figma-activity" style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <SectionLabel>{tr("Recent Transactions")}</SectionLabel>
          <Text style={styles.demo}>{DEMO_BADGE}</Text>
        </View>
        {onViewAll ? (
          <Pressable testID="home-view-all" accessibilityRole="link" onPress={onViewAll} hitSlop={12}>
            <Text style={styles.viewAll}>{tr("View All")}</Text>
          </Pressable>
        ) : null}
      </View>
      {items.map((item, index) => (
        <Fragment key={item.id}>
          {index > 0 ? <View style={styles.rule} /> : null}
          <View
            testID={`figma-activity-${item.id}`}
            style={styles.row}
            accessible
            accessibilityLabel={tr("{{title}}, {{amount}}, {{status}}, {{when}}. Demo", { title: item.title, amount: item.amount, status: tr(item.status), when: item.when })}
          >
            <View style={styles.glyph}>
              <Icon name={item.icon === 'shopping' ? 'tag' : 'swap'} color={color.text.primary} size={22} />
            </View>
            <View style={styles.main}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={[styles.amount, item.spend ? styles.spend : null]}>{item.amount}</Text>
            </View>
            <View style={styles.side}>
              <StatusPill label={tr(item.status)} tone={TONE[item.status]} />
              <Text style={styles.when}>{item.when}</Text>
            </View>
          </View>
        </Fragment>
      ))}
    </View>
  );
}

const GLYPH = 48;

const styles = themed(() => ({
  section: { gap: space.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  demo: { ...typography.caption, fontSize: 10, ...brandWeight('700'), color: color.text.secondary },
  viewAll: { ...typography.rowLabel, ...brandWeight('700'), color: color.brand.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 48 },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.border.subtle,
    marginHorizontal: 41,
    marginVertical: 12,
  },
  glyph: {
    width: GLYPH,
    height: GLYPH,
    borderRadius: GLYPH / 2,
    backgroundColor: color.bg.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: { flex: 1, gap: 9 },
  title: { ...typography.body, ...brandWeight('500'), fontSize: 16, color: color.text.primary },
  amount: { ...typography.body, ...numericTextStyle, fontSize: 15, color: color.text.primary },
  spend: { color: color.error.text },
  side: { alignItems: 'flex-end', gap: 8 },
  when: { ...typography.caption, fontSize: 11, color: color.text.primary },
}));
