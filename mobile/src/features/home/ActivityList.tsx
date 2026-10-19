/**
 * Recent transactions (Figma node 39:2882), DEC-008.
 *
 * Discrete items only: open Offers, allocations requiring attention, in-flight and
 * finished settlements. Each item carries its own amount. Amounts are never summed into
 * one figure — an aggregate currency hero reads as a balance regardless of its label, and
 * Xspeeria has no balance of any kind.
 *
 * The most time-critical item is surfaced first, and its next action is shown on the row
 * (`docs/09-ui-ux/UI_UX_SCREEN_SPEC.md`: stage and next action on each item).
 *
 * Row layout follows Figma: swap glyph, corridor over amount on the left, status chip
 * over date on the right, hairline between rows.
 */

import { Fragment, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '../../components/icons';
import { Amount, Caption, Divider, EmptyState } from '../../components/primitives';
import type { ActivityItem } from '../../fixtures';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { SectionLabel } from './SectionLabel';
import { StatusPill } from './StatusPill';
import { tr } from "../../i18n";

export function orderActivity(items: readonly ActivityItem[]): readonly ActivityItem[] {
  return [...items].sort((a, b) => Number(b.timeCritical ?? false) - Number(a.timeCritical ?? false));
}

export function ActivityList({
  items,
  onCreateOffer,
  onViewAll,
}: {
  items: readonly ActivityItem[];
  onCreateOffer?: () => void;
  onViewAll?: () => void;
}): ReactElement {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <SectionLabel>{tr("Recent transactions")}</SectionLabel>
        {onViewAll && items.length > 0 ? (
          <Pressable
            testID="home-view-all"
            accessibilityRole="link"
            onPress={onViewAll}
            hitSlop={12}
          >
            <Text style={styles.viewAll}>{tr("View all")}</Text>
          </Pressable>
        ) : null}
      </View>

      {items.length === 0 ? (
        <EmptyState
          title={tr("No active offers")}
          actionLabel={tr("Create your first offer")}
          onAction={onCreateOffer}
        />
      ) : (
        <View testID="activity-list">
          {orderActivity(items).map((item, index) => (
            <Fragment key={item.id}>
              {index > 0 ? <Divider /> : null}
              <View testID={`activity-${item.id}`} style={styles.row}>
                <View style={styles.glyph}>
                  <Icon name="swap" color={color.text.primary} size={22} />
                </View>
                <View style={styles.main}>
                  <Text style={styles.title}>{tr(item.title)}</Text>
                  <Amount
                    minor={item.amountMinor}
                    currency={item.currency}
                    scale={item.scale}
                    label={item.title}
                  />
                  {item.nextAction ? (
                    <Text style={styles.nextAction}>{item.nextAction}</Text>
                  ) : null}
                </View>
                <View style={styles.side}>
                  <StatusPill label={tr(item.status)} tone={item.statusTone} />
                  <Caption>{item.when}</Caption>
                </View>
              </View>
            </Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

const GLYPH = 44;

const styles = themed(() => ({
  section: { gap: space.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  /** Brand primary as link text, 15.30:1 on canvas. */
  viewAll: { ...typography.rowLabel, color: color.brand.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
  },
  glyph: {
    width: GLYPH,
    height: GLYPH,
    borderRadius: GLYPH / 2,
    backgroundColor: color.bg.sunken,
    borderColor: color.border.subtle,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: { flex: 1, gap: 2 },
  title: { ...typography.rowLabel, color: color.text.primary },
  side: { alignItems: 'flex-end', gap: space.xs },
  nextAction: { ...typography.caption, ...brandWeight('500'), color: color.brand.secondaryText },
}));
