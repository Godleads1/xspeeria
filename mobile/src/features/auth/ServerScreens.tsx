/**
 * Screens used only when the app talks to the real server (ADR-027):
 * - `ServerCodeScreen`: the SMS code sent by the server at sign-up (checked by the server).
 * - `MfaScreen`: the authenticator code — or a recovery code — after the PIN at log-in.
 *
 * The server owns every rule (tries, expiry, locks, resend wait); these screens show its
 * answers. Codes are never stored or logged.
 */

import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '../../components/primitives';
import { ApiError, messageFor } from '../../api/client';
import { color, space, themed, typography } from '../../theme';
import { FieldInput, OutlinedField } from '../market/controls';
import { AuthTop, GhostButton, Heading } from './ui';

const RESEND_WAIT_S = 60;

function Frame({ testID, top, children, footer }: { testID: string; top: ReactNode; children: ReactNode; footer: ReactNode }): ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView testID={testID} style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {top}
        {children}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>{footer}</View>
    </KeyboardAvoidingView>
  );
}

function CodeField({ testID, value, onChange, invalid, label = 'Code *' }: { testID: string; value: string; onChange: (v: string) => void; invalid: boolean; label?: string }): ReactElement {
  return (
    <OutlinedField label={label} invalid={invalid}>
      <FieldInput
        testID={testID}
        accessibilityLabel="6-digit code"
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, ''))}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={6}
      />
    </OutlinedField>
  );
}

/* ------------------------------------------------------------------- SMS code */

export function ServerCodeScreen({
  phone,
  verify,
  resend,
  onVerified,
  onBack,
  onExpired,
}: {
  phone: string;
  verify: (code: string) => Promise<void>;
  resend: () => Promise<void>;
  onVerified: () => void;
  onBack: () => void;
  /** The server says the sign-up must start again (e.g. the email was taken meanwhile). */
  onExpired?: () => void;
}): ReactElement {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(RESEND_WAIT_S);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async (): Promise<void> => {
    const typed = code;
    setCode('');
    setBusy(true);
    try {
      await verify(typed);
      onVerified();
    } catch (e) {
      setError(messageFor(e));
      if (e instanceof ApiError && e.code === 'AUTH_400_EMAIL_TAKEN') onExpired?.();
    } finally {
      setBusy(false);
    }
  };

  const again = async (): Promise<void> => {
    setBusy(true);
    try {
      await resend();
      setError(null);
      setWait(RESEND_WAIT_S);
    } catch (e) {
      setError(messageFor(e));
      if (e instanceof ApiError && e.retryAfterSeconds && e.retryAfterSeconds <= RESEND_WAIT_S) setWait(e.retryAfterSeconds);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame
      testID="server-sms-code"
      top={<AuthTop onBack={onBack} step={3} />}
      footer={<PrimaryButton testID="server-sms-verify" label="Verify phone" onPress={() => void submit()} disabled={code.length !== 6 || busy} />}
    >
      <Heading title="Confirm your phone" body="We sent a 6-digit code by SMS to make sure this number is yours." />
      <Text style={styles.text}>Enter the code sent to the number ending with ******{phone.slice(-4)}</Text>
      <CodeField testID="server-sms-code-input" value={code} onChange={(v) => { setCode(v); setError(null); }} invalid={Boolean(error)} label="OTP *" />
      {error ? <Text testID="server-sms-error" style={styles.error}>{error}</Text> : null}
      <Pressable testID="server-sms-resend" accessibilityRole="button" disabled={wait > 0 || busy} onPress={() => void again()} style={styles.link}>
        <Text style={wait > 0 ? styles.linkWait : styles.linkText}>{wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}</Text>
      </Pressable>
    </Frame>
  );
}

/* ---------------------------------------------------------- 2FA at log-in */

export function MfaScreen({
  verify,
  onDone,
  onRestart,
}: {
  verify: (code: { otp: string } | { recovery: string }) => Promise<void>;
  onDone: () => void;
  /** Back to the log-in screen (challenge expired, or the user goes back). */
  onRestart: () => void;
}): ReactElement {
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = useRecovery ? value.replace(/[\s-]/g, '').length === 8 : value.length === 6;

  const submit = async (): Promise<void> => {
    const typed = value;
    setValue('');
    setBusy(true);
    try {
      await verify(useRecovery ? { recovery: typed } : { otp: typed });
      onDone();
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'AUTH_410_CHALLENGE_EXPIRED' || e.status === 410)) {
        onRestart();
        return;
      }
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame
      testID="mfa-screen"
      top={<AuthTop onBack={onRestart} />}
      footer={
        <View style={styles.actions}>
          <PrimaryButton testID="mfa-verify" label="Continue" onPress={() => void submit()} disabled={!ready || busy} />
          <GhostButton
            testID="mfa-toggle"
            label={useRecovery ? 'Use my authenticator app' : 'Use a recovery code'}
            onPress={() => {
              setUseRecovery((v) => !v);
              setValue('');
              setError(null);
            }}
          />
        </View>
      }
    >
      <Heading
        title="Confirm it’s you"
        body={
          useRecovery
            ? 'Enter one of the recovery codes you saved when you set up 2FA. Each code works once. For your safety, every other phone will need a code again.'
            : 'This is a new phone for your account. Enter the 6-digit code from your authenticator app.'
        }
      />
      {useRecovery ? (
        <OutlinedField label="Recovery code *" invalid={Boolean(error)}>
          <FieldInput
            testID="mfa-recovery-input"
            accessibilityLabel="Recovery code"
            value={value}
            onChangeText={(t) => { setValue(t.toUpperCase().slice(0, 10)); setError(null); }}
            maxLength={10}
            placeholder="XXXX-XXXX"
          />
        </OutlinedField>
      ) : (
        <CodeField testID="mfa-code-input" value={value} onChange={(v) => { setValue(v); setError(null); }} invalid={Boolean(error)} />
      )}
      {error ? <Text testID="mfa-error" style={styles.error}>{error}</Text> : null}
    </Frame>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  body: { paddingHorizontal: space.md, paddingBottom: space.lg, gap: space.sm },
  footer: { paddingHorizontal: space.md, paddingTop: space.sm },
  actions: { gap: 12 },
  text: { ...typography.body, fontSize: 14, color: color.text.secondary },
  error: { ...typography.caption, color: color.error.text },
  link: { paddingVertical: space.xs },
  linkText: { ...typography.body, fontSize: 14, color: color.brand.primary },
  linkWait: { ...typography.body, fontSize: 14, color: color.text.secondary },
}));
