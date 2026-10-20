/**
 * Account details (Figma frame 1041:11224), ADR-007.
 *
 * Grey top band with a large avatar, the public handle and counterparty rating, a card of
 * personal details (name, phone, email, date of birth, gender) and the KYC-approved
 * regions with their status. Only ever shown to the account holder. MOCK DATA ONLY.
 */

import type { ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { RoundFlag } from '../../components/flags';
import { Icon, type IconName } from '../../components/icons';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { SectionLabel } from '../home/SectionLabel';
import { StatusPill } from '../home/StatusPill';
import { formatRating, genderLabel, longDate } from './data';
import { useKycRegions } from './kycRegions';
import type { KycRegion } from './data';
import { ProfileAvatar } from './ProfileAvatar';
import { useProfile } from './profileStore';
import { tr } from "../../i18n";

function Star(): ReactElement {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill={color.decorative.star} />
    </Svg>
  );
}

function Detail({ icon, label, value, note }: { icon: IconName; label: string; value: string; note?: string }): ReactElement {
  return (
    <View style={styles.detail} accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon name={icon} color={color.text.secondary} size={18} />
      <View style={styles.detailText}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
        {note ? <Text style={styles.detailLabel}>{note}</Text> : null}
      </View>
    </View>
  );
}

export function AccountDetailsScreen({
  onBack,
  onEdit,
  serverRegions,
}: {
  onBack: () => void;
  onEdit?: () => void;
  /** Server builds: the countries verified on the server (ADR-042) instead of the demo list. */
  serverRegions?: readonly KycRegion[] | null;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const user = useProfile();
  const demoRegions = useKycRegions();
  const regions = serverRegions === undefined ? demoRegions : (serverRegions ?? []);

  return (
    <View testID="account-details-screen" style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.lg }}>
        <View style={[styles.band, { paddingTop: insets.top + space.xs }]}>
          {user.bannerUri ? <Image testID="account-banner-photo" source={{ uri: user.bannerUri }} style={styles.bannerImage} /> : null}
          <View style={styles.bandBar}>
          <Pressable
            testID="account-back"
            accessibilityRole="button"
            accessibilityLabel={tr("Back")}
            onPress={onBack}
            hitSlop={12}
            style={styles.back}
          >
            <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
          </Pressable>
            {onEdit ? (
              <Pressable testID="account-edit" accessibilityRole="button" accessibilityLabel={tr("Edit profile")} onPress={onEdit} style={styles.editBtn}>
                <Icon name="pencil" color={color.text.primary} size={16} />
                <Text style={styles.editText}>{tr("Edit")}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.identity}>
          <ProfileAvatar testID="account-avatar" size={AVATAR} initials={user.initials} uri={user.avatarUri} ring={4} />
          <Text style={styles.handle}>{user.handle}</Text>
{user.ratingHundredths > 0 ? (
          <View style={styles.rating} accessible accessibilityLabel={tr("Rated {{ratingHundredths}} out of 5", { ratingHundredths: formatRating(user.ratingHundredths) })}>
            <Star />
            <Text style={styles.ratingText}>
              {formatRating(user.ratingHundredths)}
              <Text style={styles.ratingOf}>/5</Text>
            </Text>
          </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <View style={styles.card}>
            <Detail icon="idcard" label={tr("Full Name")} value={user.fullName || tr("From your ID once verified")} />
            <Detail icon="phone" label={tr("Phone Number")} value={user.phone} />
            <Detail icon="mail" label={tr("Email Address")} value={user.email} />
            <Detail
              icon="calendar"
              label={tr("Date of birth")}
              value={user.dateOfBirth ? longDate(user.dateOfBirth) : tr("From your ID once verified")}
              note={user.pendingDob ? tr("Change to {{dateOfBirth}} under review", { dateOfBirth: longDate(user.pendingDob.dateOfBirth) }) : undefined}
            />
            <Detail icon="gender" label={tr("Gender")} value={genderLabel(user.gender) || tr("From your ID once verified")} />
          </View>

          <SectionLabel>{tr("KYC approved regions")}</SectionLabel>
          <View>
            {regions.map((r) => (
              <View key={r.name} testID={`kyc-${r.flag}`} style={styles.region}>
                <RoundFlag code={r.flag} size={24} />
                <Text style={styles.regionName}>{tr(r.name)}</Text>
                <StatusPill
                  label={r.state === 'approved' ? tr("Approved") : tr("Pending")}
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

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  band: { height: 120, backgroundColor: color.border.subtle, overflow: 'hidden' },
  bannerImage: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', height: 120 },
  bandBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.md },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: color.bg.canvas, borderRadius: 18, paddingHorizontal: 12, height: 34 },
  editText: { ...typography.caption, ...brandWeight('700'), color: color.text.primary },
  back: { width: 36, height: 36, justifyContent: 'center' },
  identity: { alignItems: 'center', marginTop: -AVATAR / 2, gap: 6 },
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
}));
