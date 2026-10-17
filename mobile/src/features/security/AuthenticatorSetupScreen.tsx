/**
 * Authenticator app setup (ADR-008): 1) scan the QR or type the key, 2) enter the 6-digit
 * code to prove it works, 3) save the recovery codes (shown once). Screenshots are blocked
 * on this screen whatever the user's preference, because it shows the secret.
 */

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { usePreventScreenCapture } from 'expo-screen-capture';

import { Icon } from '../../components/icons';
import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, typography } from '../../theme';
import { QrCode } from './QrCode';
import { RecoveryCodes } from './RecoveryCodes';
import { otpauthUri } from './totp';
import { twoFactor, type RandomBytes } from './twoFactorStore';

/** `JBSWY3DP…` → `JBSW Y3DP …` for reading aloud/typing. */
export function groupKey(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, '$1 ');
}

export function AuthenticatorSetupScreen({
  account,
  random,
  onBack,
  onDone,
  now = Date.now,
}: {
  /** Shown in the authenticator app next to the code (the user's own email). */
  account: string;
  random: RandomBytes;
  onBack: () => void;
  onDone: () => void;
  now?: () => number;
}): ReactElement {
  usePreventScreenCapture('xspeeria-2fa-setup');
  const insets = useSafeAreaInsets();
  const alreadyEnrolled = twoFactor.isEnrolled();
  const [secret] = useState(() => (alreadyEnrolled ? '' : twoFactor.beginEnrolment(random)));
  const uri = useMemo(() => (secret ? otpauthUri(secret, account) : ''), [secret, account]);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [codes, setCodes] = useState<readonly string[] | null>(null);

  // Leaving before finishing discards the unconfirmed secret.
  useEffect(() => () => {
    if (!twoFactor.isEnrolled()) twoFactor.cancelEnrolment();
  }, []);

  const verify = (): void => {
    const result = twoFactor.confirmEnrolment(code, now(), random);
    if (result) {
      setCodes(result);
      setError(null);
    } else {
      setError('That code is not right. Check the time on your phone is automatic and try the newest code.');
      setCode('');
    }
  };

  return (
    <KeyboardAvoidingView
      testID="authenticator-setup-screen"
      style={[styles.screen, { paddingTop: insets.top + space.xs }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable testID="authenticator-back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>Authenticator app</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.lg }]} keyboardShouldPersistTaps="handled">
        {alreadyEnrolled && !codes ? (
          <Text testID="authenticator-already" style={styles.text}>
            Your authenticator app is already set up.
          </Text>
        ) : codes ? (
          <RecoveryCodes codes={codes} onDone={onDone} />
        ) : (
          <>
            <Text style={styles.step}>1. Scan with your authenticator app</Text>
            <Text style={styles.text}>
              Use Google Authenticator, Microsoft Authenticator, Authy or similar. Never share this code or key.
            </Text>
            <View style={styles.qr}>
              <QrCode testID="authenticator-qr" value={uri} />
            </View>
            <Text style={styles.text}>{"Can't scan? Enter this key instead:"}</Text>
            <View style={styles.keyRow}>
              <Text testID="authenticator-key" selectable style={styles.key}>{groupKey(secret)}</Text>
              <Pressable
                testID="authenticator-copy"
                accessibilityRole="button"
                accessibilityLabel="Copy key"
                hitSlop={8}
                onPress={() => {
                  Clipboard.setStringAsync(secret).then(() => setCopied(true), () => setCopied(false));
                }}
              >
                <Icon name="copy" color={color.brand.primary} size={20} />
              </Pressable>
            </View>
            {copied ? <Text style={styles.hint}>Key copied</Text> : null}

            <Text style={[styles.step, styles.stepGap]}>2. Enter the 6-digit code it shows</Text>
            <TextInput
              testID="authenticator-code"
              value={code}
              onChangeText={(t) => {
                setCode(t.replace(/\D/g, ''));
                setError(null);
              }}
              placeholder="123456"
              placeholderTextColor={color.text.disabled}
              accessibilityLabel="6-digit code"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              style={styles.input}
            />
            {error ? <Text testID="authenticator-error" style={styles.error}>{error}</Text> : null}
            <PrimaryButton testID="authenticator-verify" label="Verify and turn on" onPress={verify} disabled={code.length !== 6} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 44 },
  title: { flex: 1, textAlign: 'center', ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  headerSpacer: { width: 22 },
  body: { paddingHorizontal: space.md, paddingTop: space.md, gap: space.sm },
  step: { ...typography.headline, ...brandWeight('700'), fontSize: 17, color: color.text.primary },
  stepGap: { marginTop: space.sm },
  text: { ...typography.body, fontSize: 14, color: color.text.secondary },
  qr: { alignSelf: 'center', padding: space.sm, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: color.border.subtle },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: color.bg.sunken, borderRadius: 12, padding: space.sm },
  key: { flex: 1, fontSize: 15, letterSpacing: 1, color: color.text.primary, ...brandWeight('700') },
  hint: { ...typography.caption, color: color.success.text },
  input: {
    height: 56,
    borderWidth: 1,
    borderColor: color.border.strong,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 8,
    color: color.text.primary,
    ...brandWeight('700'),
  },
  error: { ...typography.caption, color: color.error.text },
});
