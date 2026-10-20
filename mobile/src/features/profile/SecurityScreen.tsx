/**
 * Security (Figma), ADR-007 A5.
 *
 * Rows: Change Password ›, 2 FA authentication ›, and an "Allow Screenshot" switch that
 * really blocks screenshots/screen recording app-wide when turned off. Figma's "Hide
 * Balance" is omitted: Xspeeria holds no balance (no-balance rule). Password and 2FA
 * specifics are Open Decision 2, so those rows say they are coming. MOCK ONLY.
 */

import { useState, type ReactElement } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageFor } from '../../api/client';
import { confirmWithBiometrics, type BiometricOutcome } from '../auth/biometrics';
import { useSession } from '../auth/session';
import { Icon } from '../../components/icons';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { securitySettings, useSecuritySettings } from './securitySettings';
import { tr } from "../../i18n";

/** Server builds (ADR-048): Face ID/fingerprint unlock after the 5-minute idle lock. */
export interface BiometricControl {
  supported: () => boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

export type SecurityDestination = 'password' | 'twoFactor' | 'devices';

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
  showDevices = false,
  biometric = null,
  biometrics = confirmWithBiometrics,
}: {
  onBack: () => void;
  onOpen?: (destination: SecurityDestination) => void;
  /** Server builds: the signed-in devices list (ADR-025/026). */
  showDevices?: boolean;
  biometric?: BiometricControl | null;
  biometrics?: (prompt: string) => Promise<BiometricOutcome>;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const { allowScreenshots } = useSecuritySettings();
  const s = useSession();
  const bioOn = s.biometricFor !== null && s.biometricFor === s.account.phone;
  const [bioBusy, setBioBusy] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);

  const toggleBiometric = async (on: boolean): Promise<void> => {
    if (!biometric) return;
    setBioError(null);
    if (on && !biometric.supported()) {
      setBioError(tr("Face ID or fingerprint isn’t set up on this phone."));
      return;
    }
    setBioBusy(true);
    try {
      if (on) {
        // The person holding the phone proves it is them before it is turned on.
        const r = await biometrics(tr("Turn on Face ID for Xspeeria"));
        if (r !== 'ok') {
          if (r === 'unavailable') setBioError(tr("Face ID or fingerprint isn’t set up on this phone."));
          return;
        }
        await biometric.enable();
      } else {
        await biometric.disable();
      }
    } catch (e) {
      setBioError(messageFor(e));
    } finally {
      setBioBusy(false);
    }
  };

  const open = (d: SecurityDestination, title: string): void => {
    if (onOpen) onOpen(d);
    else Alert.alert(title, tr("{{title}} is one of the next screens to be built.", { title }));
  };

  return (
    <View testID="security-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
      <View style={styles.header}>
        <Pressable testID="security-back" accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>{tr("Security")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.list}>
        <LinkRow testID="security-password" label={tr("Change Password")} onPress={() => open('password', tr("Change Password"))} />
        {/* ADR-054: server builds explain the face check, Fingerprint/Face ID and email codes. */}
        <LinkRow
          testID="security-2fa"
          label={biometric ? tr("How we check it’s you") : tr("2 FA authentication")}
          onPress={() => open('twoFactor', biometric ? tr("How we check it’s you") : tr("2 FA authentication"))}
        />
        {showDevices ? (
          <LinkRow testID="security-devices" label={tr("Signed-in devices")} onPress={() => open('devices', tr("Signed-in devices"))} />
        ) : null}
        {biometric ? (
          <View style={styles.row}>
            <Text style={styles.label}>{tr("Face ID / fingerprint")}</Text>
            <Switch
              testID="security-biometric"
              accessibilityLabel={tr("Use Face ID or fingerprint")}
              value={bioOn}
              disabled={bioBusy}
              onValueChange={(v) => void toggleBiometric(v)}
              trackColor={{ true: color.brand.secondary, false: color.border.strong }}
              thumbColor={color.bg.canvas}
            />
          </View>
        ) : null}
        {bioError ? (
          <Text testID="security-biometric-error" accessibilityRole="alert" style={styles.error}>
            {bioError}
          </Text>
        ) : null}
        <View style={styles.row}>
          <Text style={styles.label}>{tr("Allow Screenshot")}</Text>
          <Switch
            testID="security-screenshot"
            accessibilityLabel={tr("Allow Screenshot")}
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

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 44 },
  title: { flex: 1, textAlign: 'center', ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  headerSpacer: { width: 22 },
  error: { ...typography.caption, fontSize: 13, color: color.error.text, paddingVertical: space.xs },
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
}));
