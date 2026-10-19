/**
 * 2 FA authentication overview (Security → 2 FA authentication), ADR-008.
 *
 * Status, the two qualifying methods (authenticator app; passkey coming with the next app
 * build), recovery codes, and the rules. 2FA cannot be switched off.
 *
 * Demo builds use the on-device mock. With `server` (ADR-034) 2FA is always on (it is set up
 * at sign-up), "Replace" and "Get new codes" each ask for the current code, which the server
 * checks, and the new recovery codes come from the server.
 */

import { useState, type ReactElement } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../../components/icons';
import { MenuIcon } from '../../components/menuIcons';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { RecoveryCodes } from './RecoveryCodes';
import { ServerCodeSheet } from './ServerCodeSheet';
import type { ServerTwoFactor } from './serverTwoFactor';
import type { StepUp } from './stepUp';
import { RECOVERY_CODE_COUNT, twoFactor, useTwoFactor, type RandomBytes } from './twoFactorStore';
import { tr } from "../../i18n";

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
  server = null,
  onReplaceAuthenticator,
}: {
  /** Real server (ADR-034). Null: the on-device demo. */
  server?: ServerTwoFactor | null;
  /** Server builds: opens the new-authenticator screen once the replacement has started. */
  onReplaceAuthenticator?: () => void;
  onBack: () => void;
  onSetUpAuthenticator: () => void;
  stepUp: StepUp;
  random: RandomBytes;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const tf = useTwoFactor();
  const enrolled = server ? true : tf.authenticatorSecret !== null;
  const [newCodes, setNewCodes] = useState<readonly string[] | null>(null);
  const [asking, setAsking] = useState<'replace' | 'codes' | null>(null);

  const regenerate = async (): Promise<void> => {
    if (server) {
      setAsking('codes');
      return;
    }
    if (await stepUp(tr("Get new recovery codes. Your old codes will stop working."))) {
      setNewCodes(twoFactor.regenerateRecoveryCodes(random));
    }
  };

  return (
    <View testID="two-factor-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
      <View style={styles.header}>
        <Pressable testID="two-factor-back" accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>{tr("2 FA authentication")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.status}>
          <MenuIcon name="security" size={44} />
          <View style={styles.statusText}>
            <Text testID="two-factor-status" style={styles.statusTitle}>{enrolled ? tr("2 FA is on") : tr("2 FA is not set up")}</Text>
            <Text style={styles.statusBody}>
              {enrolled
                ? tr("We ask for a code when you sign in on a new phone and before sensitive changes.")
                : tr("Set it up to trade and to make changes to your account and beneficiaries.")}
            </Text>
          </View>
        </View>

        <Text style={styles.section}>{tr("Methods")}</Text>
        <MethodRow
          testID="two-factor-authenticator"
          icon="lock"
          title={tr("Authenticator app")}
          detail={enrolled ? tr("On") : tr("Codes from an app like Google Authenticator")}
          done={enrolled}
          action={server ? 'Replace' : enrolled ? undefined : tr("Set up")}
          onPress={server ? () => setAsking('replace') : enrolled ? undefined : onSetUpAuthenticator}
        />
        <MethodRow
          testID="two-factor-passkey"
          icon="key"
          title={tr("Passkey")}
          detail={tr("Face ID or fingerprint. Coming in the next app version")}
        />
        {enrolled ? (
          <MethodRow
            testID="two-factor-recovery"
            icon="document"
            title={tr("Recovery codes")}
            detail={server ? tr("Each code works once") : tr("{{length}} of {{RECOVERY_CODE_COUNT}} unused", { length: tf.recoveryCodes.length, RECOVERY_CODE_COUNT })}
            action={tr("Get new codes")}
            onPress={() => {
              void regenerate();
            }}
          />
        ) : null}

        <View style={styles.rules}>
          <Text style={styles.rule}>{tr("• 2 FA cannot be turned off. It is required to trade.")}</Text>
          <Text style={styles.rule}>{tr("• We never send codes by SMS, and Xspeeria staff will never ask for your codes.")}</Text>
          <Text style={styles.rule}>{tr("• After 5 wrong codes, 2 FA is locked for 15 minutes.")}</Text>
          <Text style={styles.rule}>{tr("• Adding a beneficiary and choosing where a deal is paid each need a code.")}</Text>
        </View>
      </ScrollView>

      <ServerCodeSheet
        visible={asking !== null}
        reason={
          asking === 'replace'
            ? tr("Replace your authenticator app. Logging in on any phone will need a code again.")
            : tr("Get new recovery codes. Your old codes will stop working.")
        }
        onCancel={() => setAsking(null)}
        onSubmit={async (code) => {
          if (!server) return;
          if (asking === 'replace') {
            await server.startReplace(code);
            setAsking(null);
            onReplaceAuthenticator?.();
          } else {
            const codes = await server.regenerate(code);
            setAsking(null);
            setNewCodes(codes);
          }
        }}
      />

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
