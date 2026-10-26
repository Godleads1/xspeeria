/**
 * KYC and limits, server builds (ADR-058). Shows the user's tier, their daily and monthly trade
 * limits in naira, and what they have used and have left (deals they take and deals on their
 * offers, from deal start; Lagos calendar day and month). The server enforces the limits; this
 * only shows its numbers.
 *
 * Xspeeria holds no money: these are limits on trading, never a balance.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Pressable, Text, View } from 'react-native';

import { messageFor } from '../../api/client';
import type { LimitsView } from '../../api/limitsApi';
import { Icon } from '../../components/icons';
import { ErrorState, LoadingState, PrimaryButton, Screen } from '../../components/primitives';
import { k, tr } from '../../i18n';
import { brandWeight, color, numericTextStyle, space, themed, typography } from '../../theme';

/** ADR-058 Decision 1, as confirmed by the owner. Display only. */
export const TIERS: readonly { level: number; needs: string; daily: string | null; monthly: string | null }[] = [
  { level: 0, needs: k('Phone and email'), daily: null, monthly: null },
  { level: 1, needs: k('Identity check (ID and selfie)'), daily: '500,000', monthly: '2,000,000' },
  { level: 2, needs: k('Tier 1, BVN and home address'), daily: '5,000,000', monthly: '20,000,000' },
  { level: 3, needs: k('Tier 2, proof of address and source of funds'), daily: '20,000,000', monthly: '100,000,000' },
];

export interface LimitsSource {
  get(): Promise<LimitsView>;
}

function naira(text: string | null): string {
  if (text === null) return '—';
  const [whole, frac = '00'] = text.split('.');
  return `NGN ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac.padEnd(2, '0')}`;
}

export function MyLimitsScreen({
  source,
  onBack,
  onVerifyIdentity,
  onUpgrade,
}: {
  source: LimitsSource;
  onBack: () => void;
  onVerifyIdentity: () => void;
  /** Opens the Tier 2 / Tier 3 checks. */
  onUpgrade?: () => void;
}): ReactElement {
  const [view, setView] = useState<LimitsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    source.get().then(setView, (e: unknown) => setError(messageFor(e)));
  }, [source]);
  useEffect(load, [load]);

  return (
    <Screen testID="my-limits-screen">
      <View style={styles.header}>
        <Pressable testID="limits-back" accessibilityRole="button" accessibilityLabel={tr('Back')} onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{tr('KYC and limits')}</Text>
        <View style={styles.spacer} />
      </View>

      {error ? (
        <ErrorState title={error} onRetry={load} />
      ) : view === null ? (
        <LoadingState label={tr('Loading your limits')} />
      ) : (
        <>
          <View testID="limits-current" style={styles.card}>
            <Text style={styles.big}>{tr('You are on Tier {{tier}}', { tier: view.tier })}</Text>
            {view.daily_limit === null ? (
              <Text style={styles.line}>{tr('You can look at the market. Verify your identity to start trading.')}</Text>
            ) : (
              <>
                <Row label={tr('Left today')} value={naira(view.left_today)} testID="limits-left-today" strong />
                <Row label={tr('Used today')} value={`${naira(view.used_today)} / ${naira(view.daily_limit)}`} />
                <Row label={tr('Left this month')} value={naira(view.left_this_month)} testID="limits-left-month" strong />
                <Row label={tr('Used this month')} value={`${naira(view.used_this_month)} / ${naira(view.monthly_limit)}`} />
                <Text style={styles.small}>
                  {tr('Counts every deal you take and every deal on your offers, from the moment it starts. A deal that isn’t paid gives its amount back. Days and months follow Lagos time.')}
                </Text>
              </>
            )}
            {view.tier === 0 ? <PrimaryButton testID="limits-verify" label={tr('Verify your identity')} onPress={onVerifyIdentity} /> : null}
            {view.tier >= 1 && view.tier < 3 && onUpgrade ? (
              <PrimaryButton testID="limits-upgrade" label={tr('Raise my limits to Tier {{tier}}', { tier: view.tier + 1 })} onPress={onUpgrade} />
            ) : null}
          </View>

          {TIERS.map((t) => (
            <View key={t.level} testID={`limits-tier-${t.level}`} style={[styles.card, t.level === view.tier ? styles.cardCurrent : null]}>
              <View style={styles.rowTop}>
                <Text style={styles.strong}>{tr('Tier {{level}}', { level: t.level })}</Text>
                {t.level === view.tier ? <Text style={styles.pill}>{tr('Current Level')}</Text> : null}
              </View>
              <Text style={styles.line}>{tr(t.needs)}</Text>
              <Text style={styles.line}>
                {t.daily === null
                  ? tr('Look only, no trading')
                  : tr('NGN {{daily}} a day · NGN {{monthly}} a month', { daily: t.daily, monthly: t.monthly ?? '' })}
              </Text>
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

function Row({ label, value, testID, strong }: { label: string; value: string; testID?: string; strong?: boolean }): ReactElement {
  return (
    <View style={styles.row}>
      <Text style={styles.line}>{label}</Text>
      <Text testID={testID} style={strong ? styles.value : styles.line}>{value}</Text>
    </View>
  );
}

const styles = themed(() => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 24 },
  title: { ...brandWeight('700'), fontSize: 20, color: color.text.primary },
  card: { gap: 6, padding: space.sm, borderRadius: 14.37, borderWidth: 1, borderColor: color.border.subtle },
  cardCurrent: { borderColor: color.brand.primary, backgroundColor: color.brand.secondarySurface },
  big: { ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  strong: { ...brandWeight('700'), fontSize: 15, color: color.text.primary },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  line: { ...typography.caption, fontSize: 13, color: color.text.secondary },
  value: { ...brandWeight('700'), ...numericTextStyle, fontSize: 14, color: color.text.primary },
  small: { ...typography.caption, fontSize: 12, color: color.text.secondary },
  pill: { ...typography.chipLabel, color: color.brand.primary },
}));
