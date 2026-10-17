/**
 * KYC and limits (Figma), ADR-007 A4.
 *
 * One card per tier: "Tier N", "Limit: X Naira per month", required documents, and either
 * a "Current Level" pill or an "Upgrade" button. Tier limits are PLACEHOLDERS pending
 * Compliance approval (see KYC_TIERS). Display only; limits are enforced server-side.
 */

import type { ReactElement } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/icons';
import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, typography } from '../../theme';
import { CURRENT_KYC_TIER, KYC_TIERS, groupThousands, type KycTier } from './data';

function TierCard({
  tier,
  current,
  onUpgrade,
}: {
  tier: KycTier;
  current: number;
  onUpgrade: (tier: KycTier) => void;
}): ReactElement {
  const isCurrent = tier.level === current;
  const isAbove = tier.level > current;
  return (
    <View testID={`kyc-tier-${tier.level}`} style={styles.card}>
      <View style={styles.cardHead}>
        <Text accessibilityRole="header" style={styles.tierTitle}>Tier {tier.level}</Text>
        {isCurrent ? (
          <View testID={`kyc-tier-${tier.level}-current`} style={styles.pill}>
            <Text style={styles.pillText}>Current Level</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.limit}>Limit: {groupThousands(tier.monthlyLimitNaira)} Naira per month</Text>
      <View style={styles.reqs}>
        {tier.requirements.map((r) => (
          <Text key={r} style={styles.req}>{r}</Text>
        ))}
      </View>
      {isAbove ? (
        <View style={styles.button}>
          <PrimaryButton testID={`kyc-tier-${tier.level}-upgrade`} label="Upgrade" onPress={() => onUpgrade(tier)} />
        </View>
      ) : null}
    </View>
  );
}

export function KycLimitsScreen({
  onBack,
  onUpgrade,
  currentTier = CURRENT_KYC_TIER,
}: {
  onBack: () => void;
  onUpgrade?: (tier: KycTier) => void;
  currentTier?: number;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const upgrade = (t: KycTier): void => {
    if (onUpgrade) onUpgrade(t);
    else Alert.alert(`Upgrade to Tier ${t.level}`, 'Verification for higher tiers is one of the next screens to be built.');
  };

  return (
    <View testID="kyc-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
      <View style={styles.header}>
        <Pressable testID="kyc-back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>KYC and limits</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.lg }]}>
        {KYC_TIERS.map((t) => (
          <TierCard key={t.level} tier={t} current={currentTier} onUpgrade={upgrade} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 44 },
  title: { flex: 1, textAlign: 'center', ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  headerSpacer: { width: 22 },
  body: { paddingHorizontal: space.sm, paddingTop: space.md, gap: space.sm },
  card: {
    backgroundColor: color.bg.sunken,
    borderRadius: 20,
    paddingHorizontal: space.sm,
    paddingVertical: space.md,
    gap: 10,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  tierTitle: { ...typography.headline, ...brandWeight('500'), fontSize: 20, color: color.text.primary },
  pill: { backgroundColor: color.brand.tint, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  pillText: { ...typography.caption, ...brandWeight('700'), fontSize: 11, color: color.brand.primary },
  limit: { ...typography.body, fontSize: 14, color: color.brand.primary },
  reqs: { gap: 2 },
  req: { ...typography.caption, fontSize: 11, color: color.text.primary },
  button: { marginTop: space.xs, paddingHorizontal: space.md },
});
