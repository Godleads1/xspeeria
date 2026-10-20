/**
 * Authenticator app setup (ADR-008): 1) scan the QR or type the key, 2) enter the 6-digit
 * code to prove it works, 3) save the recovery codes (shown once). Screenshots are blocked
 * on this screen whatever the user's preference, because it shows the secret.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/icons';
import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { QrCode } from './QrCode';
import { RecoveryCodes } from './RecoveryCodes';
import { otpauthUri } from './totp';
import { twoFactor, type RandomBytes } from './twoFactorStore';
import { copySensitive } from './sensitiveClipboard';
import { useBlockScreenCapture } from './useBlockScreenCapture';
import { tr } from "../../i18n";

/**
 * Where the secret comes from and where the first code is checked. The default is the demo
 * store on the phone; server mode (ADR-027) passes the server's sign-up enrolment, where the
 * secret is made and checked on the server and only shown here once.
 */
export interface EnrolmentEngine {
  begin: () => Promise<{ secret: string; uri: string }>;
  /** Recovery codes on success; throws (with a user message) otherwise. */
  confirm: (code: string) => Promise<readonly string[]>;
  /** Shown instead of the generic hint when `confirm` throws. */
  messageFor: (error: unknown) => string;
}

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
  engine,
}: {
  /** Shown in the authenticator app next to the code (the user's own email). */
  account: string;
  random: RandomBytes;
  onBack: () => void;
  onDone: () => void;
  now?: () => number;
  engine?: EnrolmentEngine;
}): ReactElement {
  useBlockScreenCapture('xspeeria-2fa-setup');
  const insets = useSafeAreaInsets();
  const alreadyEnrolled = engine ? false : twoFactor.isEnrolled();
  // Started in an effect, never during render: beginning enrolment updates the 2FA store,
  // and a store update while React is drawing another component is an error.
  const [secret, setSecret] = useState('');
  const [serverUri, setServerUri] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (started.current || alreadyEnrolled) return;
    started.current = true; // once per visit, even if `random` is a new function each render
    if (!engine) {
      setSecret(twoFactor.beginEnrolment(random));
      return;
    }
    engine.begin().then(
      (r) => {
        setSecret(r.secret);
        setServerUri(r.uri);
      },
      (e: unknown) => setError(engine.messageFor(e)),
    );
  }, [alreadyEnrolled, random, engine]);
  const uri = useMemo(
    () => (engine ? serverUri : secret ? otpauthUri(secret, account) : ''),
    [engine, serverUri, secret, account],
  );
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [codes, setCodes] = useState<readonly string[] | null>(null);

  // Leaving before finishing discards the unconfirmed secret (the server drops its own).
  useEffect(() => () => {
    if (!engine && !twoFactor.isEnrolled()) twoFactor.cancelEnrolment();
  }, [engine]);

  const verify = (): void => {
    if (engine) {
      const typed = code;
      setCode('');
      setBusy(true);
      engine
        .confirm(typed)
        .then(
          (result) => {
            setError(null);
            // A replacement returns no new codes (the old ones still work): finish here.
            if (result.length === 0) onDone();
            else setCodes(result);
          },
          (e: unknown) => setError(engine.messageFor(e)),
        )
        .finally(() => setBusy(false));
      return;
    }
    const result = twoFactor.confirmEnrolment(code, now(), random);
    if (result) {
      setCodes(result);
      setError(null);
    } else {
      setError(tr("That code is not right. Check the time on your phone is automatic and try the newest code."));
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
        <Pressable testID="authenticator-back" accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>{tr("Authenticator app")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.lg }]} keyboardShouldPersistTaps="handled">
        {alreadyEnrolled && !codes ? (
          <Text testID="authenticator-already" style={styles.text}>{tr("Your authenticator app is already set up.")}</Text>
        ) : codes ? (
          <RecoveryCodes codes={codes} onDone={onDone} />
        ) : (
          <>
            <Text style={styles.step}>{tr("1. Scan with your authenticator app")}</Text>
            <Text style={styles.text}>{tr("Use Google Authenticator, Microsoft Authenticator, Authy or similar. Never share this code or key.")}</Text>
            <View style={styles.qr}>
              {uri ? <QrCode testID="authenticator-qr" value={uri} /> : null}
            </View>
            <Text style={styles.text}>{tr("Can't scan? Enter this key instead:")}</Text>
            <View style={styles.keyRow}>
              <Text testID="authenticator-key" selectable style={styles.key}>{groupKey(secret)}</Text>
              <Pressable
                testID="authenticator-copy"
                accessibilityRole="button"
                accessibilityLabel={tr("Copy key")}
                hitSlop={8}
                onPress={() => {
                  copySensitive(secret).then(() => setCopied(true), () => setCopied(false));
                }}
              >
                <Icon name="copy" color={color.brand.primary} size={20} />
              </Pressable>
            </View>
            {copied ? <Text style={styles.hint}>{tr("Key copied. Paste it now: it clears in 1 minute.")}</Text> : null}

            <Text style={[styles.step, styles.stepGap]}>{tr("2. Enter the 6-digit code it shows")}</Text>
            <TextInput
              testID="authenticator-code"
              value={code}
              onChangeText={(t) => {
                setCode(t.replace(/\D/g, ''));
                setError(null);
              }}
              placeholder="123456"
              placeholderTextColor={color.text.disabled}
              accessibilityLabel={tr("6-digit code")}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              style={styles.input}
            />
            {error ? <Text testID="authenticator-error" style={styles.error}>{error}</Text> : null}
            <PrimaryButton testID="authenticator-verify" label={tr("Verify and turn on")} onPress={verify} disabled={code.length !== 6 || busy || !secret} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => ({
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
}));
