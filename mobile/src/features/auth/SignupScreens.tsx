/**
 * Sign-up (Figma onboarding row 35:1633 → 39:2248), ADR-013:
 * Let's get started (phone linked to NIN + consents) → Verify Your Identity (date of birth,
 * then selfie or OTP) → details from the NIN record + email → confirm email → Create PIN →
 * Confirm PIN → Enable Face ID → Congratulations.
 * DEMO: the NIN lookup, selfie match, SMS and email are simulated and say so on screen.
 */

import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Icon } from '../../components/icons';
import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { FieldInput, OutlinedField } from '../market/controls';
import { formatDobInput } from '../profile/ChangeDobScreen';
import { longDate } from '../profile/data';
import {
  RESEND_AFTER_MS,
  canResend,
  checkCode,
  maskContact,
  normaliseEmail,
  normalisePhone,
  parseDob,
  sendChallenge,
  type Challenge,
  type RandomBytes,
} from '../profile/verification';
import { confirmWithBiometrics, type BiometricOutcome } from './biometrics';
import { DEMO_MODE, DEMO_NIN_RECORD } from './demo';
import { detectCountry } from './location';
import { PIN_LENGTH, pinProblem, sameSecret } from './pin';
import { signup, useSignup } from './signupStore';
import { AuthTop, CheckRow, DemoNote, GhostButton, Heading, PhoneCountrySheet, PhoneInput, PinPad, fullPhone, type PhoneCountry } from './ui';
import { trRich } from "../../i18n/rich";
import { tr, k } from "../../i18n";

function Frame({
  testID,
  top,
  children,
  footer,
}: {
  testID: string;
  top?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}): ReactElement {
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

/* ------------------------------------------------------------ 1. Let's get started */

export function GetStartedScreen({
  onNext,
  onLogIn,
  onTerms,
  detect = detectCountry,
}: {
  onNext: () => void;
  onLogIn: () => void;
  onTerms: () => void;
  /** Location → country for the KYC region (location.ts); never blocks sign-up. */
  detect?: typeof detectCountry;
}): ReactElement {
  // Figma: the location prompt appears as this screen opens. Declining changes nothing here.
  useEffect(() => {
    let live = true;
    detect({ ask: true })
      .then((r) => {
        if (live) signup.update({ country: r.status === 'found' ? r.country : null });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [detect]);
  const [local, setLocal] = useState('');
  // Owner, 2026-11-09: people in the US and Canada sign up with their +1 numbers.
  const [country, setCountry] = useState<PhoneCountry>('NG');
  const [picker, setPicker] = useState(false);
  const [aml, setAml] = useState(false);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phone = normalisePhone(fullPhone(country, local));

  const next = (): void => {
    if (!phone) {
      return setError(country === 'NG' ? tr("Enter the 10-digit number linked to your NIN") : tr("Enter a valid phone number"));
    }
    signup.update({ phone });
    onNext();
  };

  return (
    <Frame
      testID="signup-start"
      top={<AuthTop step={1} />}
      footer={
        <View style={styles.actions}>
          <PrimaryButton testID="signup-start-continue" label={tr("Continue")} onPress={next} disabled={!aml || !terms || local.trim() === ''} />
          <GhostButton testID="signup-start-login" label={tr("I have a profile")} onPress={onLogIn} />
        </View>
      }
    >
      <Heading
        title={tr("Let’s get started")}
        body={tr("We require your National Identification Number (NIN) to verify your identity in compliance with regulatory and Anti-Money Laundering (AML) requirements. This helps ensure a secure and trusted platform for all users.")}
      />
      <OutlinedField label={country === 'NG' ? tr("Enter Phone Number linked to NIN *") : tr("Enter your phone number *")} invalid={Boolean(error)}>
        <PhoneInput
          testID="signup-phone"
          country={country}
          value={local}
          onChange={(t) => { setLocal(t); setError(null); }}
          onPickCountry={() => setPicker(true)}
        />
      </OutlinedField>
      <PhoneCountrySheet testID="signup-country" visible={picker} onClose={() => setPicker(false)} onPick={(c) => { setCountry(c); setError(null); }} />
      {error ? <Text testID="signup-start-error" style={styles.error}>{error}</Text> : null}
      <CheckRow testID="signup-consent-aml" checked={aml} onToggle={() => setAml((v) => !v)}>{tr("By continuing, you consent to Xspeeria conducting necessary Anti-Money Laundering (AML) checks in accordance with regulatory requirements. These checks help us maintain a safe and compliant platform for all users.")}</CheckRow>
      <CheckRow testID="signup-consent-terms" checked={terms} onToggle={() => setTerms((v) => !v)}>{trRich("By checking this box, you agree to our <1>Terms & Conditions</1> of service and <2>Privacy Notice</2> including verification of your identity through a third party and your mobile service provider", {}, {
        1: (s) => <Text testID="signup-terms-link" style={styles.link} onPress={onTerms}>{s}</Text>,
        2: (s) => <Text style={styles.link} onPress={onTerms}>{s}</Text>,
      })}</CheckRow>
    </Frame>
  );
}

/* ----------------------------------------------------------- 2. Verify Your Identity */

function FaceFrame(): ReactElement {
  const c = color.brand.secondary;
  return (
    <Svg width={84} height={84} viewBox="0 0 84 84" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M6 22V10a4 4 0 014-4h12M62 6h12a4 4 0 014 4v12M78 62v12a4 4 0 01-4 4H62M22 78H10a4 4 0 01-4-4V62" stroke={c} strokeWidth={4} fill="none" strokeLinecap="round" />
      <Circle cx={42} cy={34} r={13} stroke={c} strokeWidth={3} fill="none" />
      <Path d="M20 68c3-11 12-16 22-16s19 5 22 16" stroke={c} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Path d="M36 34l4 4 8-8" stroke={c} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function Tip({ title, body }: { title: string; body: string }): ReactElement {
  return (
    <View style={styles.tip}>
      <View style={styles.tipIcon}>
        <Icon name="check" color={color.success.text} size={14} weight={2.5} />
      </View>
      <View style={styles.tipText}>
        <Text style={styles.tipTitle}>{title}</Text>
        <Text style={styles.tipBody}>{body}</Text>
      </View>
    </View>
  );
}

export const IDENTITY_BODY =
  k("To complete your identity verification, we need to confirm your NIN. Please take a clear selfie and date of birth for facial verification or enter the OTP sent to your registered number.");

export function VerifyIdentityScreen({ onBack, onVerified, onUseOtp }: { onBack: () => void; onVerified: () => void; onUseOtp: () => void }): ReactElement {
  const [dob, setDob] = useState('');
  const [error, setError] = useState<string | null>(null);

  const openCamera = (): void => {
    const iso = parseDob(dob);
    if (!iso) return setError(tr("Enter a real date as DD/MM/YYYY"));
    if (iso !== DEMO_NIN_RECORD.dateOfBirth) return setError(tr("This date of birth doesn’t match your NIN record"));
    setError(null);
    if (!DEMO_MODE) return; // The real selfie check needs the identity provider (ADR-013 §3).
    Alert.alert(tr("Demo selfie check"), tr("No identity provider is connected. In the real app your camera opens here and your selfie is matched to your NIN photo."), [
      { text: tr("Cancel"), style: 'cancel' },
      {
        text: tr("Continue as verified"),
        onPress: () => {
          signup.update({ identityVerified: true });
          onVerified();
        },
      },
    ]);
  };

  return (
    <Frame
      testID="signup-verify"
      top={<AuthTop onBack={onBack} step={2} />}
      footer={
        <View style={styles.actions}>
          <PrimaryButton testID="signup-open-camera" label={tr("Open Camera")} onPress={openCamera} disabled={dob.length !== 10} />
          <GhostButton testID="signup-use-otp" label={tr("Verify using OTP")} onPress={onUseOtp} />
        </View>
      }
    >
      <Heading title={tr("Verify Your Identity")} body={tr(IDENTITY_BODY)} />
      <OutlinedField label={tr("Date of birth *")} invalid={Boolean(error)}>
        <FieldInput
          testID="signup-dob"
          accessibilityLabel={tr("Date of birth, day month year")}
          value={dob}
          onChangeText={(t) => { setDob(formatDobInput(t)); setError(null); }}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={10}
          placeholder="DD/MM/YYYY"
          trailing={<Icon name="calendar" color={color.text.secondary} size={20} />}
        />
      </OutlinedField>
      {error ? <Text testID="signup-verify-error" style={styles.error}>{error}</Text> : null}
      <DemoNote>{tr("Demo app: the sample NIN record’s date of birth is 12/07/1997.")}</DemoNote>
      <View style={styles.face}>
        <FaceFrame />
      </View>
      <Tip title={tr("Good lighting")} body={tr("Make sure you are in a well lit area and both ears are uncovered")} />
      <Tip title={tr("Look Straight")} body={tr("Hold your phone at eye level and look straight into the camera")} />
    </Frame>
  );
}

/* --------------------------------------------- Code step (phone OTP / email confirm) */

export function CodeScreen({
  testID,
  kind,
  target,
  title,
  body,
  verifyLabel,
  altLabel,
  onAlt,
  onBack,
  onVerified,
  random,
  now = Date.now,
  step,
}: {
  testID: string;
  kind: 'phone' | 'email';
  target: string;
  title: string;
  body: string;
  verifyLabel: string;
  altLabel?: string;
  onAlt?: () => void;
  onBack: () => void;
  onVerified: () => void;
  random: RandomBytes;
  now?: () => number;
  step?: number;
}): ReactElement {
  const [challenge, setChallenge] = useState<Challenge>(() => sendChallenge(kind, target, now(), random));
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  // An expired or used-up code is never replaced automatically: the user asks for a new one,
  // and only after the resend wait (SEC-06). Otherwise 5 tries per code would be unlimited.
  const [dead, setDead] = useState(false);
  const [tick, setTick] = useState(0);
  const wait = Math.max(0, Math.ceil((challenge.sentAt + RESEND_AFTER_MS - now()) / 1000));

  useEffect(() => {
    if (canResend(challenge, now())) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [challenge, tick, now]);

  const verify = (): void => {
    const r = checkCode(challenge, code, now());
    setCode('');
    if (r.ok) return onVerified();
    setChallenge(r.challenge);
    const usedUp = r.reason !== 'wrong' || r.challenge.triesLeft <= 0;
    if (usedUp) setDead(true);
    setError(
      usedUp
        ? tr("This code can’t be used any more. Ask for a new code.")
        : (r.challenge.triesLeft === 1 ? tr("That code is not right. 1 try left.") : tr("That code is not right. {{count}} tries left.", { count: r.challenge.triesLeft })),
    );
  };

  const resend = (): void => {
    if (!canResend(challenge, now())) return;
    setChallenge(sendChallenge(kind, target, now(), random));
    setDead(false);
    setError(null);
    setCode('');
  };

  const ending = kind === 'phone' ? tr("number ending with ******{{value}}", { value: target.slice(-4) }) : maskContact('email', target);

  return (
    <Frame
      testID={testID}
      top={<AuthTop onBack={onBack} step={step} />}
      footer={
        <View style={styles.actions}>
          <PrimaryButton testID={`${testID}-verify`} label={verifyLabel} onPress={verify} disabled={code.length !== 6 || dead} />
          {altLabel && onAlt ? <GhostButton testID={`${testID}-alt`} label={altLabel} onPress={onAlt} /> : null}
        </View>
      }
    >
      <Heading title={title} body={body} />
      <Text style={styles.text}>{tr("Enter OTP sent to {{ending}}", { ending: ending })}</Text>
      <OutlinedField label={tr("OTP *")} invalid={Boolean(error)}>
        <FieldInput
          testID={`${testID}-code`}
          accessibilityLabel={tr("6-digit code")}
          value={code}
          onChangeText={(t) => { setCode(t.replace(/\D/g, '')); setError(null); }}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={6}
        />
      </OutlinedField>
      {error ? <Text testID={`${testID}-error`} style={styles.error}>{error}</Text> : null}
      <Pressable testID={`${testID}-resend`} accessibilityRole="button" disabled={wait > 0} onPress={resend} style={styles.resend}>
        <Text style={wait > 0 ? styles.resendWait : styles.resendText}>
          {wait > 0 ? tr("Send a new code in {{wait}}s", { wait }) : tr("Send a new code")}
        </Text>
      </Pressable>
      <DemoNote testID={`${testID}-demo`}>{(kind === 'phone' ? tr("Demo app: no SMS service is connected. Your code is {{code}}.", { code: challenge.code }) : tr("Demo app: no email service is connected. Your code is {{code}}.", { code: challenge.code }))}</DemoNote>
    </Frame>
  );
}

/* ----------------------------------------------------- 3. Details + email (Figma 39:1688) */

function ReadOnly({ label, value, testID }: { label: string; value: string; testID: string }): ReactElement {
  return (
    <View style={styles.readonly}>
      <OutlinedField label={`${label} *`}>
        <Text testID={testID} style={styles.readonlyText} accessibilityLabel={tr("{{label}}: {{value}}. From your NIN record", { label, value })}>{value}</Text>
      </OutlinedField>
    </View>
  );
}

export function DetailsScreen({
  onBack,
  onNext,
  server = false,
}: {
  onBack: () => void;
  onNext: () => void;
  /** Server builds (ADR-055): no sample identity; it comes from the ID check later. */
  server?: boolean;
}): ReactElement {
  const draft = useSignup();
  const [email, setEmail] = useState(draft.email ?? '');
  const [newsletter, setNewsletter] = useState(draft.newsletter);
  const [error, setError] = useState<string | null>(null);

  const next = (): void => {
    const e = normaliseEmail(email);
    if (!e) return setError(tr("Enter a valid email address"));
    signup.update({ email: e, newsletter, emailVerified: false });
    onNext();
  };

  return (
    <Frame testID="signup-details" top={<AuthTop onBack={onBack} step={2} />} footer={<PrimaryButton testID="signup-details-continue" label={tr("Continue")} onPress={next} disabled={email.trim() === ''} />}>
      <Heading title={tr("Let’s get started")} body={server ? tr("Enter your e-mail address") : tr("Verify Your identity and provide your e-mail address")} />
      {server ? null : (
        <>
          <ReadOnly testID="signup-first" label={tr("First name")} value={DEMO_NIN_RECORD.firstName} />
          <ReadOnly testID="signup-last" label={tr("Last name")} value={DEMO_NIN_RECORD.lastName} />
        </>
      )}
      <OutlinedField label={tr("Email Address *")} invalid={Boolean(error)}>
        <FieldInput testID="signup-email" accessibilityLabel={tr("Email address")} value={email} onChangeText={(t) => { setEmail(t); setError(null); }} keyboardType="email-address" inputMode="text" maxLength={254} />
      </OutlinedField>
      {error ? <Text testID="signup-details-error" style={styles.error}>{error}</Text> : null}
      {server ? (
        <Text testID="signup-identity-later" style={styles.small}>
          {tr("Your name, date of birth and gender come from your ID when you verify your identity, so nobody can use a false name.")}
        </Text>
      ) : (
        <>
          <ReadOnly testID="signup-dob-ro" label={tr("Date of Birth")} value={longDate(DEMO_NIN_RECORD.dateOfBirth)} />
          <ReadOnly testID="signup-gender" label={tr("Gender")} value={DEMO_NIN_RECORD.gender} />
          <Text style={styles.small}>{tr("Name, date of birth and gender come from your NIN record and can’t be changed here.")}</Text>
        </>
      )}
      <CheckRow testID="signup-newsletter" checked={newsletter} onToggle={() => setNewsletter((v) => !v)}>{tr("Subscribe to our newsletter for exclusive insights, tips, and updates delivered straight to your inbox. Be the first to know.")}</CheckRow>
    </Frame>
  );
}

/* ------------------------------------------------------- 4. Create / Confirm PIN */

const PIN_BODY = k("Use your PIN to safely log in to the app. Be sure to remember it and keep it to yourself.");

function PinScreen({ testID, title, onComplete, error }: { testID: string; title: string; onComplete: (pin: string) => void; error: string | null }): ReactElement {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');
  return (
    <View testID={testID} style={[styles.screen, styles.pinScreen, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.sm }]}>
      <Text accessibilityRole="header" style={styles.pinTitle}>{title}</Text>
      <PinPad
        value={pin}
        length={PIN_LENGTH}
        onChange={(v) => {
          setPin(v);
          if (v.length === PIN_LENGTH) {
            onComplete(v);
            setPin('');
          }
        }}
      />
      {error ? <Text testID={`${testID}-error`} style={[styles.error, styles.center]}>{error}</Text> : null}
      <Text style={styles.pinBody}>{tr(PIN_BODY)}</Text>
    </View>
  );
}

export function CreatePinScreen({ onNext }: { onNext: () => void }): ReactElement {
  const [error, setError] = useState<string | null>(null);
  return (
    <PinScreen
      testID="signup-create-pin"
      title={tr("Create PIN")}
      error={error}
      onComplete={(p) => {
        const problem = pinProblem(p);
        if (problem) return setError(problem);
        setError(null);
        signup.update({ pin: p, pinConfirmed: false });
        onNext();
      }}
    />
  );
}

export function ConfirmPinScreen({ onNext, onRestart }: { onNext: () => void; onRestart: () => void }): ReactElement {
  const draft = useSignup();
  const [error, setError] = useState<string | null>(null);
  return (
    <PinScreen
      testID="signup-confirm-pin"
      title={tr("Confirm PIN")}
      error={error}
      onComplete={(p) => {
        if (draft.pin && sameSecret(p, draft.pin)) {
          signup.update({ pinConfirmed: true });
          return onNext();
        }
        setError(tr("PINs didn’t match. Create your PIN again."));
        signup.update({ pin: null, pinConfirmed: false });
        setTimeout(onRestart, 900);
      }}
    />
  );
}

/* ----------------------------------------------------------- 5. Enable Face ID */

function FaceIdArt(): ReactElement {
  const blue = '#3B82F6';
  return (
    <Svg width={110} height={110} viewBox="0 0 110 110" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M8 28V14a6 6 0 016-6h14M82 8h14a6 6 0 016 6v14M102 82v14a6 6 0 01-6 6H82M28 102H14a6 6 0 01-6-6V82" stroke={blue} strokeWidth={5} fill="none" strokeLinecap="round" />
      <Rect x={33} y={70} width={44} height={22} rx={11} fill="#FBCFE8" />
      <Circle cx={55} cy={50} r={22} fill="#FBCFE8" />
      <Path d="M33 48c0-16 10-24 22-24s22 8 22 24c-6-8-14-10-22-10s-16 2-22 10z" fill="#1E3A8A" />
      <Path d="M18 55h74" stroke={blue} strokeWidth={4} strokeLinecap="round" />
    </Svg>
  );
}

export function EnableBiometricsScreen({
  onNext,
  biometrics = confirmWithBiometrics,
  enable,
}: {
  onNext: () => void;
  biometrics?: (prompt: string) => Promise<BiometricOutcome>;
  enable: () => void;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const turnOn = async (): Promise<void> => {
    const r = await biometrics(tr("Turn on Face ID for Xspeeria"));
    if (r === 'ok') {
      enable();
      onNext();
    } else if (r === 'unavailable') {
      Alert.alert(tr("Not available"), tr("Face ID or fingerprint isn’t set up on this phone. You can log in with your PIN."), [{ text: 'OK', onPress: onNext }]);
    }
  };
  return (
    <View testID="signup-biometrics" style={[styles.screen, styles.center, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.sm, paddingHorizontal: space.md }]}>
      <Text accessibilityRole="header" style={styles.pinTitle}>{tr("Enable Face ID")}</Text>
      <View style={styles.bioArt}>
        <FaceIdArt />
      </View>
      <Text style={styles.pinBody}>{tr("Secure your account and enjoy quick, seamless logins using Face ID.")}{'\n'}{tr("Your face is your password—easy, fast, and secure.")}</Text>
      <View style={[styles.actions, styles.stretch]}>
        <PrimaryButton testID="signup-enable-faceid" label={tr("Enable Face ID")} onPress={() => void turnOn()} />
        <GhostButton testID="signup-not-now" label={tr("Not now")} onPress={onNext} />
      </View>
    </View>
  );
}

/* ----------------------------------------------------------- 6. Congratulations */

function CheerArt(): ReactElement {
  return (
    <Svg width={110} height={110} viewBox="0 0 110 110" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M24 22l8 8M86 22l-8 8" stroke="#FCD34D" strokeWidth={4} strokeLinecap="round" />
      <Path d="M55 8l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#FBBF24" stroke="#1E3A8A" strokeWidth={2.5} strokeLinejoin="round" />
      <Path d="M28 46c0 14 6 22 14 26v24h26V72c8-4 14-12 14-26" stroke="#1E3A8A" strokeWidth={5} fill="#60A5FA" strokeLinecap="round" />
      <Circle cx={55} cy={58} r={11} fill="#3B82F6" stroke="#1E3A8A" strokeWidth={4} />
    </Svg>
  );
}

export function DoneScreen({ onFinish }: { onFinish: () => void }): ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <View testID="signup-done" style={[styles.screen, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.sm, paddingHorizontal: space.md }]}>
      <View style={[styles.center, styles.grow]}>
        <CheerArt />
        <Text accessibilityRole="header" style={styles.congrats}>{tr("Congratulations!")}</Text>
        <Text style={styles.pinBody}>{tr("You have successfully created an Xspeeria profile")}</Text>
      </View>
      <PrimaryButton testID="signup-finish" label={tr("Proceed to Home")} onPress={onFinish} />
    </View>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  body: { paddingHorizontal: space.md, gap: space.sm, paddingBottom: space.md },
  footer: { paddingHorizontal: space.md, paddingTop: space.xs },
  actions: { gap: 12 },
  stretch: { alignSelf: 'stretch' },
  error: { ...typography.caption, color: color.error.text },
  resend: { alignSelf: 'flex-start', paddingVertical: space.xs },
  resendText: { ...typography.body, ...brandWeight('700'), color: color.brand.primary },
  resendWait: { ...typography.body, color: color.text.secondary },
  link: { color: color.warning.text, textDecorationLine: 'underline' },
  text: { ...typography.body, fontSize: 14, color: color.text.secondary },
  small: { ...typography.caption, color: color.text.secondary },
  face: { alignItems: 'center', paddingVertical: space.md },
  tip: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  tipIcon: { width: 24, height: 24, borderRadius: 6, backgroundColor: color.success.surface, alignItems: 'center', justifyContent: 'center' },
  tipText: { flex: 1, gap: 2 },
  tipTitle: { ...typography.body, ...brandWeight('500'), fontSize: 14, color: color.text.primary },
  tipBody: { ...typography.caption, fontSize: 13, color: color.text.secondary },
  readonly: { opacity: 0.75 },
  readonlyText: { ...typography.body, fontSize: 16, color: color.text.secondary, paddingVertical: 10 },
  pinScreen: { paddingHorizontal: space.md, alignItems: 'center', gap: space.md },
  pinTitle: { ...typography.headline, ...brandWeight('700'), fontSize: 22, color: color.text.primary, textAlign: 'center' },
  pinBody: { ...typography.body, fontSize: 14, lineHeight: 21, color: color.text.secondary, textAlign: 'center' },
  center: { alignItems: 'center' },
  grow: { flex: 1, justifyContent: 'center', gap: space.sm },
  bioArt: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  congrats: { ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.brand.primary, marginTop: space.md },
}));
