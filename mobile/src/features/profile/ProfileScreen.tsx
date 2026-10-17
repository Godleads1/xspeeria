/**
 * Profile (Figma frame 268:6134), ADR-007.
 *
 * Header (avatar, name, "Account details" ›), then the menu: Manage Beneficiaries, KYC and
 * limits, Security, FAQ, Contact Support, Referral Program, Terms and Conditions, the
 * Switch Mode row, and a red "Delete Profile". Rows whose screens are not built yet say so
 * instead of doing nothing. MOCK DATA ONLY.
 */

import type { ReactElement } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Icon } from '../../components/icons';
import { MenuIcon, type MenuIconName } from '../../components/menuIcons';
import { Screen } from '../../components/primitives';
import { brandWeight, color, typography } from '../../theme';
import { PROFILE_USER } from './data';

export type ProfileDestination =
  | 'account'
  | 'beneficiaries'
  | 'kyc'
  | 'security'
  | 'faq'
  | 'support'
  | 'referral'
  | 'terms';

const ITEMS: readonly { key: ProfileDestination; icon: MenuIconName; title: string; subtitle: string }[] = [
  { key: 'beneficiaries', icon: 'beneficiaries', title: 'Manage Beneficiaries', subtitle: 'Manage your account and beneficiaries' },
  { key: 'kyc', icon: 'kyc', title: 'KYC and limits', subtitle: 'Know your KYC Level and limits.' },
  { key: 'security', icon: 'security', title: 'Security', subtitle: 'Protect yourself from intruders' },
  { key: 'faq', icon: 'faq', title: 'FAQ', subtitle: 'Find answers to common questions' },
  { key: 'support', icon: 'support', title: 'Contact Support', subtitle: 'Get support or send feedback' },
  { key: 'referral', icon: 'referral', title: 'Referral Program', subtitle: 'Get 10% off fees when your friends join Xspeeria' },
  { key: 'terms', icon: 'terms', title: 'Terms and Conditions', subtitle: 'Learn about our terms and conditions, privacy policies' },
];

function Badge({ icon }: { icon: MenuIconName }): ReactElement {
  return (
    <View style={styles.badge}>
      <MenuIcon name={icon} size={26} />
    </View>
  );
}

function Row({
  icon,
  title,
  subtitle,
  onPress,
  testID,
}: {
  icon: MenuIconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  testID: string;
}): ReactElement {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      <Badge icon={icon} />
      <View style={styles.rowDivided}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{title}</Text>
          <Text style={styles.rowSubtitle}>{subtitle}</Text>
        </View>
        <Icon name="chevron" color={color.text.secondary} size={16} weight={2} />
      </View>
    </Pressable>
  );
}

export function ProfileScreen({
  onOpen,
}: {
  /** Where each row goes; rows without a screen yet explain that they are coming. */
  onOpen?: (destination: ProfileDestination) => void;
}): ReactElement {
  const user = PROFILE_USER;

  const open = (key: ProfileDestination, title: string): void => {
    if (onOpen) onOpen(key);
    else Alert.alert(title, `${title} is one of the next screens to be built.`);
  };

  const confirmDelete = (): void =>
    Alert.alert(
      'Delete your profile?',
      'This closes your Xspeeria account. Trades in progress must finish first, and records we are required to keep by law are retained. This flow is not built yet — nothing will be deleted.',
      [{ text: 'Keep my profile', style: 'cancel' }],
    );

  return (
    <Screen testID="profile-screen">
      <Pressable
        testID="profile-account"
        accessibilityRole="button"
        accessibilityLabel={`${user.fullName}. Account details`}
        onPress={() => open('account', 'Account details')}
        style={({ pressed }) => [styles.header, pressed ? styles.pressed : null]}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.initials}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.name}>{user.fullName}</Text>
          <Text style={styles.headerSub}>Account details</Text>
        </View>
        <Icon name="chevron" color={color.text.secondary} size={16} weight={2} />
      </Pressable>

      <View style={styles.list}>
        {ITEMS.map((item) => (
          <Row
            key={item.key}
            testID={`profile-${item.key}`}
            icon={item.icon}
            title={item.title}
            subtitle={item.subtitle}
            onPress={() => open(item.key, item.title)}
          />
        ))}

        <View style={styles.row} accessible accessibilityLabel="Switch Mode. Dark mode is coming soon">
          <Badge icon="mode" />
          <View style={styles.rowDivided}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Switch Mode</Text>
              <Text style={styles.rowSubtitle}>Dark mode is coming soon</Text>
            </View>
            <Text style={styles.modeLabel}>Light Mode</Text>
            {/* Disabled until a dark palette exists: a working-looking switch that did nothing would mislead. */}
            <Switch testID="profile-mode" value={false} disabled />
          </View>
        </View>
      </View>

      <Pressable
        testID="profile-delete"
        accessibilityRole="button"
        onPress={confirmDelete}
        hitSlop={8}
        style={styles.delete}
      >
        <Text style={styles.deleteText}>Delete Profile</Text>
      </Pressable>
    </Screen>
  );
}

const AVATAR = 70;
const BADGE = 40;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: color.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...brandWeight('700'), fontSize: 24, color: color.text.onFill },
  headerText: { flex: 1, gap: 4 },
  name: { ...typography.headline, ...brandWeight('700'), fontSize: 19, color: color.text.primary },
  headerSub: { ...typography.body, fontSize: 14, color: color.text.secondary },
  list: { marginTop: -4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68 },
  pressed: { backgroundColor: color.bg.sunken },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    backgroundColor: color.bg.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Figma: dividers start under the text, not under the icon.
  rowDivided: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { ...typography.body, ...brandWeight('500'), fontSize: 16, color: color.text.primary },
  rowSubtitle: { ...typography.caption, fontSize: 11, color: color.text.secondary },
  modeLabel: { ...typography.caption, color: color.text.secondary },
  delete: { alignSelf: 'center', paddingVertical: 12 },
  deleteText: { ...typography.body, ...brandWeight('700'), fontSize: 16, color: color.error.text },
});
