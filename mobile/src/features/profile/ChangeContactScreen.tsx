/**
 * Change phone number or email with proof (ADR-011):
 * 1. enter the new number/email; 2. pass the 2 FA re-check (ADR-008); 3. a 6-digit code goes
 * to the NEW address; 4. the change applies only when that code is entered. The old address
 * is told about the change (server-side). MOCK: no SMS/email provider yet — in development
 * builds the code is shown on screen so the flow can be tried.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/icons';
import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { FieldInput, OutlinedField } from '../market/controls';
import type { StepUp } from '../security/stepUp';
import { profileStore, useProfile } from './profileStore';
import {
  RESEND_AFTER_MS,
  canResend,
  checkCode,
  maskContact,
  normaliseEmail,
  normalisePhone,
  sendChallenge,
  type Challenge,
  type ContactKind,
  type RandomBytes,
} from './verification';
import { tr, k } from "../../i18n";

const COPY: Record<ContactKind, { title: string; label: string; via: string; invalid: string; same: string; done: string }> = {
  phone: {
    title: k("Change phone number"),
    label: k("New phone number"),
    via: k("We will text a 6-digit code to the new number to confirm it is yours."),
    invalid: k("Enter the full number with country code, e.g. +234 803 000 0000"),
    same: k("This is already your phone number"),
    done: k("Phone number updated. We have let your old number know about this change."),
  },
  email: {
    title: k("Change email address"),
    label: k("New email address"),
    via: k("We will email a 6-digit code to the new address to confirm it is yours."),
    invalid: k("Enter a valid email address"),
    same: k("This is already your email address"),
    done: k("Email address updated. We have let your old email know about this change."),
  },
};

export function ChangeContactScreen({
  kind,
  onBack,
  onDone,
  stepUp,
  random,
  now = Date.now,
  showDevCode = __DEV__,
}: {
  kind: ContactKind;
  onBack: () => void;
  onDone: () => void;
  stepUp: StepUp;
  random: RandomBytes;
  now?: () => number;
  /** Development only: there is no SMS/email provider yet. */
  showDevCode?: boolean;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const copy = COPY[kind];
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState('');
  const [done, setDone] = useState(false);
  const [tick, setTick] = useState(0);

  // Re-render each second while a resend countdown is running.
  useEffect(() => {
    if (!challenge || canResend(challenge, now())) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [challenge, tick, now]);

  const normalise = kind === 'phone' ? normalisePhone : normaliseEmail;
  const current = kind === 'phone' ? normalisePhone(profile.phone) : normaliseEmail(profile.email);

  const sendCode = async (): Promise<void> => {
    const target = normalise(value);
    if (!target) return setError(tr(copy.invalid));
    if (target === current) return setError(tr(copy.same));
    setError(null);
    if (!(await stepUp(tr("{{title}} to {{target}}", { title: tr(copy.title), target: maskContact(kind, target) })))) return;
    setChallenge(sendChallenge(kind, target, now(), random));
  };

  const verify = (): void => {
    if (!challenge) return;
    const r = checkCode(challenge, code, now());
    setCode('');
    if (r.ok) {
      if (kind === 'phone') profileStore.confirmPhone(challenge.target);
      else profileStore.confirmEmail(challenge.target);
      setDone(true);
      return;
    }
    setChallenge(r.challenge);
    setError(
      r.reason === 'expired'
        ? tr("This code has expired. Send a new one.")
        : r.reason === 'used-up'
          ? tr("Too many wrong codes. Send a new one.")
          : (r.challenge.triesLeft === 1 ? tr("That code is not right. 1 try left.") : tr("That code is not right. {{count}} tries left.", { count: r.challenge.triesLeft })),
    );
  };

  const resend = (): void => {
    if (!challenge || !canResend(challenge, now())) return;
    setError(null);
    setChallenge(sendChallenge(kind, challenge.target, now(), random));
  };

  const wait = challenge ? Math.max(0, Math.ceil((challenge.sentAt + RESEND_AFTER_MS - now()) / 1000)) : 0;
  const blocked = challenge !== null && (challenge.triesLeft <= 0 || now() > challenge.expiresAt);

  return (
    <KeyboardAvoidingView
      testID="change-contact-screen"
      style={[styles.screen, { paddingTop: insets.top + space.xs }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable testID="change-contact-back" accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>{tr(copy.title)}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {done ? (
          <>
            <Text testID="change-contact-done" style={styles.text}>{tr(copy.done)}</Text>
            <PrimaryButton testID="change-contact-finish" label={tr("Done")} onPress={onDone} />
          </>
        ) : !challenge ? (
          <>
            <Text style={styles.text}>{tr(copy.via)}</Text>
            <OutlinedField label={`${tr(copy.label)} *`} invalid={Boolean(error)}>
              <FieldInput
                testID="change-contact-value"
                accessibilityLabel={tr(copy.label)}
                value={value}
                onChangeText={(t) => {
                  setValue(t);
                  setError(null);
                }}
                keyboardType={kind === 'phone' ? 'phone-pad' : 'email-address'}
                inputMode="text"
                maxLength={kind === 'phone' ? 20 : 254}
                placeholder={kind === 'phone' ? '+234 803 000 0000' : 'name@example.com'}
              />
            </OutlinedField>
            {error ? <Text testID="change-contact-error" style={styles.error}>{error}</Text> : null}
            <PrimaryButton testID="change-contact-send" label={tr("Send code")} onPress={() => void sendCode()} disabled={value.trim() === ''} />
          </>
        ) : (
          <>
            <Text testID="change-contact-sent" style={styles.text}>{tr("Enter the 6-digit code we sent to {{target}}. It expires in 10 minutes.", { target: maskContact(kind, challenge.target) })}</Text>
            {showDevCode ? (
              <Text testID="change-contact-devcode" style={styles.dev}>{(kind === 'phone' ? tr("Test build: no SMS service is connected yet. Your code is {{code}}.", { code: challenge.code }) : tr("Test build: no email service is connected yet. Your code is {{code}}.", { code: challenge.code }))}</Text>
            ) : null}
            <TextInput
              testID="change-contact-code"
              value={code}
              onChangeText={(t) => {
                setCode(t.replace(/\D/g, ''));
                setError(null);
              }}
              placeholder="123456"
              placeholderTextColor={color.text.disabled}
              accessibilityLabel={tr("6-digit code")}
              keyboardType="number-pad"
              autoComplete={kind === 'phone' ? 'sms-otp' : 'one-time-code'}
              textContentType="oneTimeCode"
              maxLength={6}
              editable={!blocked}
              style={styles.code}
            />
            {error ? <Text testID="change-contact-error" style={styles.error}>{error}</Text> : null}
            <PrimaryButton testID="change-contact-verify" label={tr("Confirm")} onPress={verify} disabled={code.length !== 6 || blocked} />
            <Pressable testID="change-contact-resend" accessibilityRole="button" disabled={wait > 0} onPress={resend} style={styles.resend}>
              <Text style={wait > 0 ? styles.resendWait : styles.resendText}>
                {wait > 0 ? tr("Send a new code in {{wait}}s", { wait }) : tr("Send a new code")}
              </Text>
            </Pressable>
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
  text: { ...typography.body, fontSize: 15, lineHeight: 22, color: color.text.primary },
  dev: { ...typography.caption, color: color.warning.text, backgroundColor: color.warning.surface, padding: 10, borderRadius: 8 },
  code: {
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
  resend: { alignSelf: 'center', paddingVertical: space.xs },
  resendText: { ...typography.body, ...brandWeight('700'), color: color.brand.primary },
  resendWait: { ...typography.body, color: color.text.secondary },
}));
