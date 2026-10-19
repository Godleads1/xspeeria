/**
 * Forgot PIN against the real server (ADR-046; ADR-025: no reset without the second factor).
 *
 * 1. Phone number → the server texts a code (same answer whether or not an account exists).
 * 2. SMS code + authenticator code (or a recovery code) + new PIN twice → done; every device
 *    is signed out, so the user logs in again. Codes and PINs live only in this screen's state.
 */

import { useState, type ReactElement } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageFor } from '../../api/client';
import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { FieldInput, OutlinedField } from '../market/controls';
import { normalisePhone } from '../profile/verification';
import type { PinSource } from './serverPin';
import { AuthTop, Heading, PhoneInput, fullPhone } from './ui';

type Step = 'phone' | 'reset' | 'done';

export function ServerForgotScreen({ source, onBack }: { source: PinSource; onBack: () => void }): ReactElement {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [e164, setE164] = useState<string | null>(null);
  const [sms, setSms] = useState('');
  const [second, setSecond] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
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
    if (!n) return setError('Enter a valid phone number');
    void run(async () => {
      await source.resetStart(n);
      setE164(n);
      setStep('reset');
    });
  };

  const reset = (): void => {
    if (!/^\d{6}$/.test(sms)) return setError('Enter the 6-digit code from the SMS');
    if (!useRecovery && !/^\d{6}$/.test(second)) return setError('Enter the 6-digit code from your authenticator app');
    if (useRecovery && second.trim().length < 8) return setError('Enter one of your recovery codes');
    if (!/^\d{6}$/.test(pin)) return setError('Your new PIN must be 6 digits');
    if (pin !== pin2) return setError('The two PINs do not match');
    const typed = { sms, second: second.trim(), pin };
    void run(async () => {
      await source.resetConfirm(
        e164 ?? '',
        typed.sms,
        typed.pin,
        useRecovery ? { recovery_code: typed.second } : { otp_code: typed.second },
      );
      setSms('');
      setSecond('');
      setPin('');
      setPin2('');
      setStep('done');
    });
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
            <Heading title="Forgot PIN" body="Enter the phone number on your Xspeeria account. We will text you a code." />
            <OutlinedField label="Phone Number" invalid={Boolean(error)}>
              <PhoneInput testID="forgot-phone" country="NG" value={phone} onChange={setPhone} />
            </OutlinedField>
          </>
        ) : step === 'reset' ? (
          <>
            <Heading
              title="Set a new PIN"
              body="If this number has an account, we have sent a code by SMS. You also need your authenticator app or a recovery code."
            />
            {field('SMS code', sms, setSms, 'forgot-sms', { digits: true })}
            {useRecovery
              ? field('Recovery code', second, setSecond, 'forgot-recovery')
              : field('Authenticator code', second, setSecond, 'forgot-otp', { digits: true })}
            <Pressable
              testID="forgot-toggle-recovery"
              accessibilityRole="button"
              onPress={() => {
                setUseRecovery((v) => !v);
                setSecond('');
              }}
            >
              <Text style={styles.link}>{useRecovery ? 'Use my authenticator app instead' : 'Lost your phone? Use a recovery code'}</Text>
            </Pressable>
            {field('New PIN', pin, setPin, 'forgot-pin', { digits: true, secure: true })}
            {field('Confirm new PIN', pin2, setPin2, 'forgot-pin2', { digits: true, secure: true })}
          </>
        ) : (
          <>
            <Heading title="PIN changed" body="Your PIN has been reset and every device has been signed out. Log in with your new PIN." />
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
          <PrimaryButton testID="forgot-submit" label={busy ? 'Sending…' : 'Send code'} onPress={sendCode} disabled={busy} />
        ) : step === 'reset' ? (
          <PrimaryButton testID="forgot-reset" label={busy ? 'Saving…' : 'Reset PIN'} onPress={reset} disabled={busy} />
        ) : (
          <PrimaryButton testID="forgot-back-login" label="Back to log in" onPress={onBack} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  body: { paddingHorizontal: space.md, gap: space.sm },
  link: { ...typography.caption, ...brandWeight('700'), fontSize: 13, color: color.brand.secondaryText },
  error: { ...typography.caption, color: color.error.text },
  footer: { paddingHorizontal: space.md },
}));
