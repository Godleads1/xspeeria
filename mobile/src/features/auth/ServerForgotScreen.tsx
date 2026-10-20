/**
 * Forgot PIN against the real server (ADR-046; ADR-054: no reset without a second check).
 *
 * 1. Phone number → the server texts a code (same answer whether or not an account exists).
 * 2. SMS code + new PIN twice.
 * 3. The second check: a face check after the identity check, an email code before it →
 *    done; every device is signed out, so the user logs in again. Codes and PINs live only in
 *    this screen's state.
 */

import { useState, type ReactElement } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Check } from '../../api/authApi';
import { messageFor } from '../../api/client';
import { PrimaryButton } from '../../components/primitives';
import { color, space, themed, typography } from '../../theme';
import { FieldInput, OutlinedField } from '../market/controls';
import { CheckFields } from '../security/CheckFields';
import { normalisePhone } from '../profile/verification';
import type { PinSource } from './serverPin';
import { AuthTop, Heading, PhoneInput, fullPhone } from './ui';
import { tr } from "../../i18n";

type Step = 'phone' | 'reset' | 'check' | 'done';

async function openLink(url: string): Promise<void> {
  await Linking.openURL(url);
}

export function ServerForgotScreen({
  source,
  onBack,
  openUrl = openLink,
}: {
  source: PinSource;
  onBack: () => void;
  openUrl?: (url: string) => Promise<void>;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [e164, setE164] = useState<string | null>(null);
  const [sms, setSms] = useState('');
  const [check, setCheck] = useState<Check | null>(null);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (): void => {
    const n = normalisePhone(fullPhone('NG', phone));
    if (!n) return setError(tr("Enter a valid phone number"));
    void run(async () => {
      await source.resetStart(n);
      setE164(n);
      setStep('reset');
    });
  };

  const reset = (): void => {
    if (!/^\d{6}$/.test(sms)) return setError(tr("Enter the 6-digit code from the SMS"));
    if (!/^\d{6}$/.test(pin)) return setError(tr("Your new PIN must be 6 digits"));
    if (pin !== pin2) return setError(tr("The two PINs do not match"));
    const typed = sms;
    void run(async () => {
      setSms('');
      setCheck(await source.resetVerify(e164 ?? '', typed));
      setStep('check');
    });
  };

  const finish = async (emailCode: string | null): Promise<void> => {
    if (!check) return;
    await source.resetConfirm(check.check_id, pin, emailCode);
    setPin('');
    setPin2('');
    setCheck(null);
    setStep('done');
  };

  const field = (
    label: string,
    value: string,
    set: (t: string) => void,
    testID: string,
    opts: { secure?: boolean; digits?: boolean } = {},
  ): ReactElement => (
    <OutlinedField label={label} invalid={false}>
      <FieldInput
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={(t) => {
          set(opts.digits ? t.replace(/\D/g, '').slice(0, 6) : t.slice(0, 16));
          setError(null);
        }}
        keyboardType={opts.digits ? 'number-pad' : 'default'}
        inputMode={opts.digits ? 'numeric' : 'text'}
        maxLength={opts.digits ? 6 : 16}
        secure={opts.secure}
      />
    </OutlinedField>
  );

  return (
    <KeyboardAvoidingView
      testID="forgot-screen"
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <AuthTop onBack={onBack} />
        {step === 'phone' ? (
          <>
            <Heading title={tr("Forgot PIN")} body={tr("Enter the phone number on your Xspeeria account. We will text you a code.")} />
            <OutlinedField label={tr("Phone Number")} invalid={Boolean(error)}>
              <PhoneInput testID="forgot-phone" country="NG" value={phone} onChange={setPhone} />
            </OutlinedField>
          </>
        ) : step === 'reset' ? (
          <>
            <Heading title={tr("Set a new PIN")} body={tr("If this number has an account, we have sent a code by SMS.")} />
            {field(tr("SMS code"), sms, setSms, 'forgot-sms', { digits: true })}
            {field(tr("New PIN"), pin, setPin, 'forgot-pin', { digits: true, secure: true })}
            {field(tr("Confirm new PIN"), pin2, setPin2, 'forgot-pin2', { digits: true, secure: true })}
          </>
        ) : step === 'check' && check ? (
          <>
            <Heading title={tr("Confirm it’s you")} body={tr("One more check before your new PIN is saved.")} />
            <CheckFields
              check={check}
              submitLabel={tr("Reset PIN")}
              onCodes={(email) => finish(email)}
              onFaceStart={() => source.resetFaceStart(check.check_id)}
              onFaceFinish={() => finish(null)}
              openUrl={openUrl}
              onEnded={(message) => {
                setCheck(null);
                setStep('phone');
                setError(message);
              }}
            />
          </>
        ) : (
          <>
            <Heading title={tr("PIN changed")} body={tr("Your PIN has been reset and every device has been signed out. Log in with your new PIN.")} />
          </>
        )}
        {error ? (
          <Text testID="forgot-error" accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
        {step === 'phone' ? (
          <PrimaryButton testID="forgot-submit" label={busy ? tr("Sending…") : tr("Send code")} onPress={sendCode} disabled={busy} />
        ) : step === 'reset' ? (
          <PrimaryButton testID="forgot-reset" label={busy ? tr("Checking…") : tr("Continue")} onPress={reset} disabled={busy} />
        ) : step === 'check' ? null : (
          <PrimaryButton testID="forgot-back-login" label={tr("Back to log in")} onPress={onBack} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  body: { paddingHorizontal: space.md, gap: space.sm },
  error: { ...typography.caption, color: color.error.text },
  footer: { paddingHorizontal: space.md },
}));
