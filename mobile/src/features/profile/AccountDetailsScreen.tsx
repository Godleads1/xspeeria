/**
 * Account details (Figma frame 1041:11224), ADR-007.
 *
 * Grey top band with a large avatar, the public handle and counterparty rating, a card of
 * personal details (name, phone, email, date of birth, gender) and the KYC-approved
 * regions with their status. Only ever shown to the account holder. MOCK DATA ONLY.
 */

import type { ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { RoundFlag } from '../../components/flags';
import { Icon, type IconName } from '../../components/icons';
import { brandWeight, color, space, typography } from '../../theme';
import { SectionLabel } from '../home/SectionLabel';
import { StatusPill } from '../home/StatusPill';
import { KYC_REGIONS, PROFILE_USER, formatRating, longDate } from './data';

function Star(): ReactElement {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill={color.decorative.star} />
    </Svg>
  );
}

function Detail({ icon, label, value }: { icon: IconName; label: string; value: string }): ReactElement {
  return (
    <View style={styles.detail} accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon name={icon} color={color.text.secondary} size={18} />
      <View style={styles.detailText}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

export function AccountDetailsScreen({ onBack }: { onBack: () => void }): ReactElement {
  const insets = useSafeAreaInsets();
  const user = PROFILE_USER;

  return (
    <View testID="account-details-screen" style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.lg }}>
        <View style={[styles.band, { paddingTop: insets.top + space.xs }]}>
          <Pressable
            testID="account-back"
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            hitSlop={12}
            style={styles.back}
          >
            <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
          </Pressable>
        </View>

        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.initials}</Text>
          </View>
          <Text style={styles.handle}>{user.handle}</Text>
          <View style={styles.rating} accessible accessibilityLabel={`Rated ${formatRating(user.ratingHundredths)} out of 5`}>
            <Star />
            <Text style={styles.ratingText}>
              {formatRating(user.ratingHundredths)}
              <Text style={styles.ratingOf}>/5</Text>
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.card}>
            <Detail icon="idcard" label="Full Name" value={user.fullName} />
            <Detail icon="phone" label="Phone Number" value={user.phone} />
            <Detail icon="mail" label="Email Address" value={user.email} />
            <Detail icon="calendar" label="Date of birth" value={longDate(user.dateOfBirth)} />
            <Detail icon="gender" label="Gender" value={user.gender} />
          </View>

          <SectionLabel>KYC approved regions</SectionLabel>
          <View>
            {KYC_REGIONS.map((r) => (
              <View key={r.name} testID={`kyc-${r.flag}`} style={styles.region}>
                <RoundFlag code={r.flag} size={24} />
                <Text style={styles.regionName}>{r.name}</Text>
                <StatusPill
                  label={r.state === 'approved' ? 'Approved' : 'Pending'}
                  tone={r.state === 'approved' ? 'success' : 'warning'}
                />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const AVATAR = 132;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  band: { height: 120, backgroundColor: color.border.subtle, paddingHorizontal: space.md },
  back: { width: 36, height: 36, justifyContent: 'center' },
  identity: { alignItems: 'center', marginTop: -AVATAR / 2, gap: 6 },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 4,
    borderColor: color.bg.canvas,
    backgroundColor: color.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...brandWeight('700'), fontSize: 40, color: color.text.onFill },
  handle: { ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { ...typography.caption, ...brandWeight('700'), color: color.text.primary },
  ratingOf: { ...brandWeight('400'), color: color.text.secondary },
  body: { paddingHorizontal: space.md, paddingTop: space.md, gap: space.sm },
  card: {
    backgroundColor: color.bg.sunken,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border.subtle,
    padding: space.sm,
    gap: 14,
  },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  detailText: { flex: 1, gap: 2 },
  detailLabel: { ...typography.caption, fontSize: 11, color: color.text.secondary },
  detailValue: { ...typography.body, ...brandWeight('700'), fontSize: 15, color: color.text.primary },
  region: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
  regionName: { flex: 1, ...typography.body, fontSize: 16, color: color.text.primary },
});
