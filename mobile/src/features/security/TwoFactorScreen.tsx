/**
 * 2 FA authentication overview (Security → 2 FA authentication), ADR-008.
 *
 * Status, the two qualifying methods (authenticator app; passkey coming with the next app
 * build), recovery codes, and the rules. 2FA cannot be switched off. MOCK ONLY.
 */

import { useState, type ReactElement } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../../components/icons';
import { MenuIcon } from '../../components/menuIcons';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { RecoveryCodes } from './RecoveryCodes';
import type { StepUp } from './stepUp';
import { RECOVERY_CODE_COUNT, twoFactor, useTwoFactor, type RandomBytes } from './twoFactorStore';

function MethodRow({
  icon,
  title,
  detail,
  action,
  onPress,
  testID,
  done = false,
}: {
  icon: IconName;
  title: string;
  detail: string;
  action?: string;
  onPress?: () => void;
  testID: string;
  done?: boolean;
}): ReactElement {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !onPress }}
      accessibilityLabel={`${title}. ${detail}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      <View style={styles.rowIcon}>
        <Icon name={icon} color={color.brand.primary} size={20} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={[styles.rowDetail, done ? styles.on : null]}>{detail}</Text>
      </View>
      {action ? <Text style={styles.action}>{action}</Text> : null}
    </Pressable>
  );
}

export function TwoFactorScreen({
  onBack,
  onSetUpAuthenticator,
  stepUp,
  random,
}: {
  onBack: () => void;
  onSetUpAuthenticator: () => void;
  stepUp: StepUp;
  random: RandomBytes;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const tf = useTwoFactor();
  const enrolled = tf.authenticatorSecret !== null;
  const [newCodes, setNewCodes] = useState<readonly string[] | null>(null);

  const regenerate = async (): Promise<void> => {
    if (await stepUp('Get new recovery codes. Your old codes will stop working.')) {
      setNewCodes(twoFactor.regenerateRecoveryCodes(random));
    }
  };

  return (
    <View testID="two-factor-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
      <View style={styles.header}>
        <Pressable testID="two-factor-back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>2 FA authentication</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.status}>
          <MenuIcon name="security" size={44} />
          <View style={styles.statusText}>
            <Text testID="two-factor-status" style={styles.statusTitle}>{enrolled ? '2 FA is on' : '2 FA is not set up'}</Text>
            <Text style={styles.statusBody}>
              {enrolled
                ? 'We ask for a code when you sign in on a new phone and before sensitive changes.'
                : 'Set it up to trade and to make changes to your account and beneficiaries.'}
            </Text>
          </View>
        </View>

        <Text style={styles.section}>Methods</Text>
        <MethodRow
          testID="two-factor-authenticator"
          icon="lock"
          title="Authenticator app"
          detail={enrolled ? 'On' : 'Codes from an app like Google Authenticator'}
          done={enrolled}
          action={enrolled ? undefined : 'Set up'}
          onPress={enrolled ? undefined : onSetUpAuthenticator}
        />
        <MethodRow
          testID="two-factor-passkey"
          icon="key"
          title="Passkey"
          detail="Face ID or fingerprint. Coming in the next app version"
        />
        {enrolled ? (
          <MethodRow
            testID="two-factor-recovery"
            icon="document"
            title="Recovery codes"
            detail={`${tf.recoveryCodes.length} of ${RECOVERY_CODE_COUNT} unused`}
            action="Get new codes"
            onPress={() => {
              void regenerate();
            }}
          />
        ) : null}

        <View style={styles.rules}>
          <Text style={styles.rule}>• 2 FA cannot be turned off. It is required to trade.</Text>
          <Text style={styles.rule}>• We never send codes by SMS, and Xspeeria staff will never ask for your codes.</Text>
          <Text style={styles.rule}>• After 5 wrong codes, 2 FA is locked for 15 minutes.</Text>
          <Text style={styles.rule}>• Payouts to a new beneficiary, or after a 2 FA reset, are held for 24 hours.</Text>
        </View>
      </ScrollView>

      <Modal visible={newCodes !== null} animationType="slide" onRequestClose={() => undefined}>
        <ScrollView contentContainerStyle={[styles.modalBody, { paddingTop: insets.top + space.md }]}>
          {newCodes ? <RecoveryCodes codes={newCodes} onDone={() => setNewCodes(null)} /> : null}
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 44 },
  title: { flex: 1, textAlign: 'center', ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  headerSpacer: { width: 22 },
  body: { paddingHorizontal: space.md, paddingTop: space.md, gap: space.xs },
  status: { flexDirection: 'row', gap: space.sm, alignItems: 'center', backgroundColor: color.bg.sunken, borderRadius: 20, padding: space.sm },
  statusText: { flex: 1, gap: 4 },
  statusTitle: { ...typography.headline, ...brandWeight('700'), fontSize: 17, color: color.text.primary },
  statusBody: { ...typography.caption, fontSize: 13, color: color.text.secondary },
  section: { ...typography.body, fontSize: 14, color: color.text.secondary, marginTop: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
  pressed: { backgroundColor: color.bg.sunken },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.bg.sunken, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...typography.body, ...brandWeight('500'), fontSize: 15, color: color.text.primary },
  rowDetail: { ...typography.caption, fontSize: 12, color: color.text.secondary },
  on: { color: color.success.text, ...brandWeight('700') },
  action: { ...typography.body, ...brandWeight('700'), fontSize: 14, color: color.brand.primary },
  rules: { marginTop: space.md, gap: 6 },
  rule: { ...typography.caption, fontSize: 12, color: color.text.secondary },
  modalBody: { padding: space.md },
}));
