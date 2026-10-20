/**
 * Screens used only when the app talks to the real server (ADR-027):
 * - `ServerCodeScreen`: the SMS code sent by the server at sign-up (checked by the server).
 * - `CheckScreen`: the second check after the PIN or the SMS code (ADR-054): email/SMS codes
 *   or a face check.
 *
 * The server owns every rule (tries, expiry, locks, resend wait); these screens show its
 * answers. Codes are never stored or logged.
 */

import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Check } from '../../api/authApi';
import { PrimaryButton } from '../../components/primitives';
import { ApiError, messageFor } from '../../api/client';
import { CheckFields } from '../security/CheckFields';
import type { CheckOutcome } from './serverAuth';
import { color, space, themed, typography } from '../../theme';
import { FieldInput, OutlinedField } from '../market/controls';
import { AuthTop, Heading } from './ui';
import { tr } from "../../i18n";

const RESEND_WAIT_S = 60;

function Frame({ testID, top, children, footer }: { testID: string; top: ReactNode; children: ReactNode; footer: ReactNode | null }): ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView testID={testID} style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {top}
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>{footer}</View> : <View style={{ height: insets.bottom + space.sm }} />}
    </KeyboardAvoidingView>
  );
}

function CodeField({ testID, value, onChange, invalid, label = tr("Code *") }: { testID: string; value: string; onChange: (v: string) => void; invalid: boolean; label?: string }): ReactElement {
  return (
    <OutlinedField label={label} invalid={invalid}>
      <FieldInput
        testID={testID}
        accessibilityLabel={tr("6-digit code")}
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
      footer={<PrimaryButton testID="server-sms-verify" label={tr("Verify phone")} onPress={() => void submit()} disabled={code.length !== 6 || busy} />}
    >
      <Heading title={tr("Confirm your phone")} body={tr("We sent a 6-digit code by SMS to make sure this number is yours.")} />
      <Text style={styles.text}>{tr("Enter the code sent to the number ending with ******{{value}}", { value: phone.slice(-4) })}</Text>
      <CodeField testID="server-sms-code-input" value={code} onChange={(v) => { setCode(v); setError(null); }} invalid={Boolean(error)} label={tr("OTP *")} />
      {error ? <Text testID="server-sms-error" style={styles.error}>{error}</Text> : null}
      <Pressable testID="server-sms-resend" accessibilityRole="button" disabled={wait > 0 || busy} onPress={() => void again()} style={styles.link}>
        <Text style={wait > 0 ? styles.linkWait : styles.linkText}>{wait > 0 ? tr("Send a new code in {{wait}}s", { wait }) : tr("Send a new code")}</Text>
      </Pressable>
    </Frame>
  );
}

/* ------------------------------------------------- the second check (ADR-054) */

export function CheckScreen({
  check,
  codes,
  faceStart,
  faceFinish,
  openUrl,
  onDone,
  onRestart,
}: {
  check: Check;
  codes: (email: string, sms: string | null) => Promise<CheckOutcome>;
  faceStart: () => Promise<string | null>;
  faceFinish: () => Promise<CheckOutcome>;
  openUrl: (url: string) => Promise<void>;
  onDone: (outcome: CheckOutcome) => void;
  /** Back to the log-in screen (check expired or failed, or the user goes back). */
  onRestart: (message?: string) => void;
}): ReactElement {
  const signup = check.purpose === 'signup';
  const title = signup ? tr("Confirm your email") : check.method === 'face' ? tr("Confirm it’s you with a selfie") : tr("Confirm it’s you");
  const body = signup ? tr("One last step: confirm the email on your account.") : tr("This is a new phone for your account.");
  return (
    <Frame testID="check-screen" top={<AuthTop onBack={() => onRestart()} step={signup ? 3 : undefined} />} footer={null}>
      <Heading title={title} body={body} />
      <CheckFields
        check={check}
        submitLabel={tr("Continue")}
        onCodes={async (email, sms) => onDone(await codes(email, sms))}
        onFaceStart={faceStart}
        onFaceFinish={async () => onDone(await faceFinish())}
        openUrl={openUrl}
        onEnded={(message) => onRestart(message)}
      />
    </Frame>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  body: { paddingHorizontal: space.md, paddingBottom: space.lg, gap: space.sm },
  footer: { paddingHorizontal: space.md, paddingTop: space.sm },
  text: { ...typography.body, fontSize: 14, color: color.text.secondary },
  error: { ...typography.caption, color: color.error.text },
  link: { paddingVertical: space.xs },
  linkText: { ...typography.body, fontSize: 14, color: color.brand.primary },
  linkWait: { ...typography.body, fontSize: 14, color: color.text.secondary },
}));
