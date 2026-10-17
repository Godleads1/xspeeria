/**
 * Welcome Back (Figma 39:2291 / 342:6006), ADR-013. Phone number or e-mail tab, PIN,
 * "Forgot PIN?", "Remember me", "Use face ID", Login and "I don't have a profile".
 * Errors never reveal whether an account exists. 5 wrong PINs lock log-in for 15 minutes.
 * DEMO: one demo account; "Fill demo details" is shown while DEMO_MODE is on.
 */

import { useState, type ReactElement } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/icons';
import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { ActionSheet, FieldInput, OutlinedField } from '../market/controls';
import { confirmWithBiometrics, type BiometricOutcome } from './biometrics';
import { DEMO_ACCOUNT } from './demo';
import { session, useSession } from './session';
import { AuthTop, CheckRow, DemoNote, GhostButton, Heading, PhoneInput, fullPhone } from './ui';

type Mode = 'phone' | 'email';

export function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }): ReactElement {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {(['phone', 'email'] as const).map((m) => (
        <Pressable
          key={m}
          testID={`login-tab-${m}`}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === m }}
          onPress={() => onChange(m)}
          style={[styles.tab, mode === m ? styles.tabOn : null]}
        >
          <Text style={[styles.tabText, mode === m ? styles.tabTextOn : null]}>{m === 'phone' ? 'Phone number' : 'E-mail Address'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function LoginScreen({
  onDone,
  onSignUp,
  onForgot,
  now = Date.now,
  biometrics = confirmWithBiometrics,
}: {
  onDone: () => void;
  onSignUp: () => void;
  onForgot: () => void;
  now?: () => number;
  biometrics?: (prompt: string) => Promise<BiometricOutcome>;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const s = useSession();
  const remembered = s.remembered;
  const [mode, setMode] = useState<Mode>(remembered?.includes('@') ? 'email' : 'phone');
  const [country, setCountry] = useState<'NG' | 'GB'>(remembered?.startsWith('+44') ? 'GB' : 'NG');
  const [phone, setPhone] = useState(remembered && !remembered.includes('@') ? remembered.replace(/^\+(234|44)/, '') : '');
  const [email, setEmail] = useState(remembered?.includes('@') ? remembered : '');
  const [pin, setPin] = useState('');
  const [remember, setRemember] = useState(remembered !== null);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);

  const submit = (): void => {
    const id = mode === 'phone' ? fullPhone(country, phone) : email;
    const r = session.logIn(id, pin, now(), remember);
    setPin('');
    if (r.ok) return onDone();
    if (r.reason === 'invalid') setError(mode === 'phone' ? 'Enter your phone number' : 'Enter a valid email address');
    else if (r.reason === 'locked') setError(`Too many wrong tries. Try again in ${Math.max(1, Math.ceil((r.until - now()) / 60000))} minutes.`);
    else setError(`Those details don’t match an account. ${r.triesLeft} ${r.triesLeft === 1 ? 'try' : 'tries'} left.`);
  };

  const faceId = async (): Promise<void> => {
    if (!session.get().biometric) {
      Alert.alert('Face ID is off', 'Log in with your PIN first, then turn on Face ID for this phone.');
      return;
    }
    const r = await biometrics('Log in to Xspeeria');
    if (r === 'ok' && session.logInWithBiometrics(now())) onDone();
    else if (r === 'unavailable') Alert.alert('Not available', 'Face ID or fingerprint isn’t set up on this phone.');
  };

  const fillDemo = (): void => {
    setMode('phone');
    setCountry('NG');
    setPhone(DEMO_ACCOUNT.phone.replace('+234', ''));
    setPin(DEMO_ACCOUNT.pin);
    setError(null);
  };

  return (
    <KeyboardAvoidingView testID="login-screen" style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.sm }]} keyboardShouldPersistTaps="handled">
        <AuthTop />
        <Heading
          title="Welcome Back"
          body={`Enter your ${mode === 'phone' ? 'phone number' : 'email address'} associated with your Xspeeria to log in`}
        />
        <ModeTabs
          mode={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
        />
        {mode === 'phone' ? (
          <OutlinedField label="Phone Number">
            <PhoneInput testID="login-phone" country={country} value={phone} onChange={setPhone} onPickCountry={() => setPicker(true)} />
          </OutlinedField>
        ) : (
          <OutlinedField label="Email Address">
            <FieldInput testID="login-email" accessibilityLabel="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" inputMode="text" maxLength={254} placeholder="enter email address" />
          </OutlinedField>
        )}
        <OutlinedField label="PIN *" invalid={Boolean(error)}>
          <FieldInput testID="login-pin" accessibilityLabel="PIN" value={pin} onChangeText={(t) => setPin(t.replace(/\D/g, ''))} keyboardType="number-pad" inputMode="numeric" maxLength={4} secure />
        </OutlinedField>
        <Pressable testID="login-forgot" accessibilityRole="link" onPress={onForgot} style={styles.forgot} hitSlop={8}>
          <Text style={styles.forgotText}>Forgot PIN?</Text>
        </Pressable>
        {error ? <Text testID="login-error" style={styles.error}>{error}</Text> : null}
        <CheckRow testID="login-remember" checked={remember} onToggle={() => setRemember((r) => !r)}>Remember me</CheckRow>

        <Pressable testID="login-faceid" accessibilityRole="button" onPress={() => void faceId()} style={styles.face}>
          <Icon name="scan" color={color.text.primary} size={30} />
          <Text style={styles.faceText}>Use face ID</Text>
        </Pressable>

        <DemoNote testID="login-demo">
          Demo app: log in with {DEMO_ACCOUNT.phone} or {DEMO_ACCOUNT.email}, PIN {DEMO_ACCOUNT.pin}.{' '}
          <Text testID="login-demo-fill" onPress={fillDemo} style={styles.demoLink}>Fill demo details</Text>
        </DemoNote>

        <View style={styles.actions}>
          <PrimaryButton testID="login-submit" label="Login" onPress={submit} disabled={pin.length !== 4} />
          <GhostButton testID="login-signup" label="I don’t have a profile" onPress={onSignUp} />
        </View>
      </ScrollView>

      <ActionSheet
        testID="login-country"
        visible={picker}
        onClose={() => setPicker(false)}
        actions={[
          { key: 'NG', label: 'Nigeria', hint: '+234', onPress: () => { setCountry('NG'); setPicker(false); } },
          { key: 'GB', label: 'United Kingdom', hint: '+44', onPress: () => { setCountry('GB'); setPicker(false); } },
        ]}
      />
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  body: { paddingHorizontal: space.md, gap: space.sm },
  tabs: { flexDirection: 'row', borderWidth: 1, borderColor: color.border.subtle, borderRadius: 28, padding: 4, marginTop: space.xs },
  tab: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: color.bg.sunken },
  tabText: { ...typography.body, fontSize: 15, color: color.text.secondary },
  tabTextOn: { ...brandWeight('700'), color: color.brand.primary },
  forgot: { alignSelf: 'flex-end' },
  forgotText: { ...typography.caption, ...brandWeight('500'), color: color.success.text },
  error: { ...typography.caption, color: color.error.text },
  face: { alignItems: 'center', gap: 6, marginVertical: space.md },
  faceText: { ...typography.caption, color: color.text.primary },
  demoLink: { ...brandWeight('700'), textDecorationLine: 'underline' },
  actions: { gap: 12, marginTop: space.xs },
}));
