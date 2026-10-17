/**
 * Forgot PIN (Figma 559:4183 / 559:4280 "Forgot Password"), ADR-013. Phone or e-mail, then
 * one neutral message whether or not an account exists (no account enumeration). Resetting
 * the PIN itself needs the backend and a 2 FA check; not built yet.
 */

import { useState, type ReactElement } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '../../components/primitives';
import { color, space, themed, typography } from '../../theme';
import { FieldInput, OutlinedField } from '../market/controls';
import { normaliseEmail, normalisePhone } from '../profile/verification';
import { DEMO_ACCOUNT } from './demo';
import { ModeTabs } from './LoginScreen';
import { AuthTop, DemoNote, Heading, PhoneInput, fullPhone } from './ui';

export function ForgotScreen({ onBack }: { onBack: () => void }): ReactElement {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = (): void => {
    const ok = mode === 'phone' ? normalisePhone(fullPhone('NG', phone)) : normaliseEmail(email);
    if (!ok) return setError(mode === 'phone' ? 'Enter a valid phone number' : 'Enter a valid email address');
    setError(null);
    setSent(true);
  };

  return (
    <KeyboardAvoidingView testID="forgot-screen" style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <AuthTop onBack={onBack} />
        <Heading title="Forgot Password" body="Enter your phone number/ Email Address associated with your Xspeeria account to recover your password" />
        {sent ? (
          <>
            <Text testID="forgot-sent" style={styles.text}>
              If an account matches those details, we have sent instructions to reset your PIN. Check your messages.
            </Text>
            <DemoNote>Demo app: no message is sent. The demo PIN is {DEMO_ACCOUNT.pin}.</DemoNote>
          </>
        ) : (
          <>
            <ModeTabs mode={mode} onChange={(m) => { setMode(m); setError(null); }} />
            {mode === 'phone' ? (
              <OutlinedField label="Phone Number" invalid={Boolean(error)}>
                <PhoneInput testID="forgot-phone" country="NG" value={phone} onChange={setPhone} />
              </OutlinedField>
            ) : (
              <OutlinedField label="Email Address" invalid={Boolean(error)}>
                <FieldInput testID="forgot-email" accessibilityLabel="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" inputMode="text" maxLength={254} placeholder="enter email address" />
              </OutlinedField>
            )}
            {error ? <Text testID="forgot-error" style={styles.error}>{error}</Text> : null}
          </>
        )}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
        {sent ? (
          <PrimaryButton testID="forgot-back-login" label="Back to log in" onPress={onBack} />
        ) : (
          <PrimaryButton testID="forgot-submit" label="Reset Password" onPress={submit} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  body: { paddingHorizontal: space.md, gap: space.sm },
  text: { ...typography.body, fontSize: 15, lineHeight: 22, color: color.text.primary },
  error: { ...typography.caption, color: color.error.text },
  footer: { paddingHorizontal: space.md },
}));
