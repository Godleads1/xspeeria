/**
 * Security (Figma), ADR-007 A5.
 *
 * Rows: Change Password ›, 2 FA authentication ›, and an "Allow Screenshot" switch that
 * really blocks screenshots/screen recording app-wide when turned off. Figma's "Hide
 * Balance" is omitted: Xspeeria holds no balance (no-balance rule). Password and 2FA
 * specifics are Open Decision 2, so those rows say they are coming. MOCK ONLY.
 */

import type { ReactElement } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/icons';
import { brandWeight, color, space, typography } from '../../theme';
import { securitySettings, useSecuritySettings } from './securitySettings';

export type SecurityDestination = 'password' | 'twoFactor';

function LinkRow({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }): ReactElement {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      <Text style={styles.label}>{label}</Text>
      <Icon name="chevron" color={color.text.secondary} size={14} weight={2} />
    </Pressable>
  );
}

export function SecurityScreen({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  onOpen?: (destination: SecurityDestination) => void;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const { allowScreenshots } = useSecuritySettings();

  const open = (d: SecurityDestination, title: string): void => {
    if (onOpen) onOpen(d);
    else Alert.alert(title, `${title} is one of the next screens to be built.`);
  };

  return (
    <View testID="security-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
      <View style={styles.header}>
        <Pressable testID="security-back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>Security</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.list}>
        <LinkRow testID="security-password" label="Change Password" onPress={() => open('password', 'Change Password')} />
        <LinkRow testID="security-2fa" label="2 FA authentication" onPress={() => open('twoFactor', '2 FA authentication')} />
        <View style={styles.row}>
          <Text style={styles.label}>Allow Screenshot</Text>
          <Switch
            testID="security-screenshot"
            accessibilityLabel="Allow Screenshot"
            value={allowScreenshots}
            onValueChange={(v) => securitySettings.setAllowScreenshots(v)}
            trackColor={{ true: color.brand.secondary, false: color.border.strong }}
            thumbColor={color.bg.canvas}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 44 },
  title: { flex: 1, textAlign: 'center', ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  headerSpacer: { width: 22 },
  list: { paddingHorizontal: space.md, paddingTop: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
  pressed: { backgroundColor: color.bg.sunken },
  label: { ...typography.body, ...brandWeight('500'), fontSize: 15, color: color.text.primary },
});
