/**
 * Profile (Figma frame 268:6134), ADR-007.
 *
 * Header (avatar, name, "Account details" ›), then the menu: Manage Beneficiaries, KYC and
 * limits, Security, FAQ, Contact Support, Referral Program, Terms and Conditions, the
 * Switch Mode row (light/dark, ADR-010), and a red "Delete Profile". Rows whose screens are not built yet say so
 * instead of doing nothing. MOCK DATA ONLY.
 */

import { useState, type ReactElement } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Icon } from '../../components/icons';
import { MenuIcon, type MenuIconName } from '../../components/menuIcons';
import { Screen } from '../../components/primitives';
import { brandWeight, color, setThemeMode, typography, themed, useThemeMode } from '../../theme';
import { ProfileAvatar } from './ProfileAvatar';
import { useProfile } from './profileStore';
import { k, tr, useLanguage } from "../../i18n";
import { LanguageSheet, currentLanguageName } from './LanguageSheet';

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
  { key: 'beneficiaries', icon: 'beneficiaries', title: k("Manage Beneficiaries"), subtitle: k("Manage your account and beneficiaries") },
  { key: 'kyc', icon: 'kyc', title: k("KYC and limits"), subtitle: k("Know your KYC Level and limits.") },
  { key: 'security', icon: 'security', title: k("Security"), subtitle: k("Protect yourself from intruders") },
  { key: 'faq', icon: 'faq', title: k("FAQ"), subtitle: k("Find answers to common questions") },
  { key: 'support', icon: 'support', title: k("Contact Support"), subtitle: k("Get support or send feedback") },
  { key: 'referral', icon: 'referral', title: k("Referral Program"), subtitle: k("Get 10% off fees when your friends join Xspeeria") },
  { key: 'terms', icon: 'terms', title: k("Terms and Conditions"), subtitle: k("Learn about our terms and conditions, privacy policies") },
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
  onLogOut,
}: {
  /** Signs out after a confirmation (ADR-013). */
  onLogOut?: () => void;
  /** Where each row goes; rows without a screen yet explain that they are coming. */
  onOpen?: (destination: ProfileDestination) => void;
}): ReactElement {
  const user = useProfile();
  const dark = useThemeMode() === 'dark';
  const lang = useLanguage();
  const [languageOpen, setLanguageOpen] = useState(false);

  const open = (key: ProfileDestination, title: string): void => {
    if (onOpen) onOpen(key);
    else Alert.alert(title, tr("{{title}} is one of the next screens to be built.", { title }));
  };

  const confirmDelete = (): void =>
    Alert.alert(
      tr("Delete your profile?"),
      tr("This closes your Xspeeria account. Trades in progress must finish first, and records we are required to keep by law are retained. This flow is not built yet — nothing will be deleted."),
      [{ text: tr("Keep my profile"), style: 'cancel' }],
    );

  return (
    <Screen testID="profile-screen">
      <Pressable
        testID="profile-account"
        accessibilityRole="button"
        accessibilityLabel={tr("{{fullName}}. Account details", { fullName: user.fullName })}
        onPress={() => open('account', tr("Account details"))}
        style={({ pressed }) => [styles.header, pressed ? styles.pressed : null]}
      >
        <ProfileAvatar testID="profile-avatar" size={70} initials={user.initials} uri={user.avatarUri} />
        <View style={styles.headerText}>
          <Text style={styles.name}>{user.fullName}</Text>
          <Text style={styles.headerSub}>{tr("Account details")}</Text>
        </View>
        <Icon name="chevron" color={color.text.secondary} size={16} weight={2} />
      </Pressable>

      <View style={styles.list}>
        {ITEMS.map((item) => (
          <Row
            key={item.key}
            testID={`profile-${item.key}`}
            icon={item.icon}
            title={tr(item.title)}
            subtitle={tr(item.subtitle)}
            onPress={() => open(item.key, tr(item.title))}
          />
        ))}

        <View style={styles.row}>
          <Badge icon="mode" />
          <View style={styles.rowDivided}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{tr("Switch Mode")}</Text>
              <Text style={styles.rowSubtitle}>{tr("Choose a light or dark appearance")}</Text>
            </View>
            <Text style={styles.modeLabel}>{dark ? tr("Dark Mode") : tr("Light Mode")}</Text>
            <Switch
              testID="profile-mode"
              accessibilityLabel={tr("Dark mode")}
              value={dark}
              onValueChange={(on) => setThemeMode(on ? 'dark' : 'light')}
              trackColor={{ true: color.brand.secondary, false: color.border.strong }}
              thumbColor={color.text.onFill}
            />
          </View>
        </View>

        <Row
          testID="profile-language"
          icon="language"
          title={tr("Language")}
          subtitle={currentLanguageName(lang)}
          onPress={() => setLanguageOpen(true)}
        />
      </View>
      <LanguageSheet visible={languageOpen} onClose={() => setLanguageOpen(false)} />

      {onLogOut ? (
        <Pressable
          testID="profile-logout"
          accessibilityRole="button"
          onPress={() =>
            Alert.alert(tr("Log out?"), tr("You will need your PIN or Face ID to log in again."), [
              { text: tr("Cancel"), style: 'cancel' },
              { text: tr("Log out"), style: 'destructive', onPress: onLogOut },
            ])
          }
          hitSlop={8}
          style={styles.delete}
        >
          <Text style={styles.logoutText}>{tr("Log out")}</Text>
        </Pressable>
      ) : null}

      <Pressable
        testID="profile-delete"
        accessibilityRole="button"
        onPress={confirmDelete}
        hitSlop={8}
        style={styles.delete}
      >
        <Text style={styles.deleteText}>{tr("Delete Profile")}</Text>
      </Pressable>
    </Screen>
  );
}

const BADGE = 40;

const styles = themed(() => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
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
  logoutText: { ...typography.body, ...brandWeight('700'), fontSize: 16, color: color.brand.primary },
  deleteText: { ...typography.body, ...brandWeight('700'), fontSize: 16, color: color.error.text },
}));
