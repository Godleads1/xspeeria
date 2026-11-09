/**
 * Welcome Back (Figma 39:2291 / 342:6006), ADR-013. Phone number or e-mail tab, PIN,
 * "Forgot PIN?", "Remember me", "Use face ID", Login and "I don't have a profile".
 * Errors never reveal whether an account exists. 5 wrong PINs lock log-in for 15 minutes.
 * DEMO: one demo account; "Fill demo details" is shown while DEMO_MODE is on.
 */

import { useState, type ReactElement } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../../components/icons";
import { PrimaryButton } from "../../components/primitives";
import { brandWeight, color, space, themed, typography } from "../../theme";
import { FieldInput, OutlinedField } from "../market/controls";
import { confirmWithBiometrics, type BiometricOutcome } from "./biometrics";
import { API_BASE_URL } from "../../api/config";
import { ApiError, messageFor } from "../../api/client";
import { DEMO_ACCOUNT } from "./demo";
import type { LoginOutcome } from "./serverAuth";
import { PIN_LENGTH } from "./pin";
import { session, useSession } from "./session";
import {
  AuthTop,
  CheckRow,
  DemoNote,
  GhostButton,
  Heading,
  PhoneInput,
  fullPhone,
  PhoneCountrySheet,
  splitPhone,
  type PhoneCountry,
} from "./ui";
import { tr } from "../../i18n";

type Mode = "phone" | "email";

export function ModeTabs({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}): ReactElement {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {(["phone", "email"] as const).map((m) => (
        <Pressable
          key={m}
          testID={`login-tab-${m}`}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === m }}
          onPress={() => onChange(m)}
          style={[styles.tab, mode === m ? styles.tabOn : null]}
        >
          <Text style={[styles.tabText, mode === m ? styles.tabTextOn : null]}>
            {m === "phone" ? tr("Phone number") : tr("E-mail Address")}
          </Text>
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
  server = null,
  onSecondFactor,
}: {
  onDone: () => void;
  onSignUp: () => void;
  onForgot: () => void;
  now?: () => number;
  biometrics?: (prompt: string) => Promise<BiometricOutcome>;
  /**
   * Server mode (ADR-027): log in against the real server. Defaults off; the route turns it
   * on when the app is built with a server address.
   */
  server?: {
    login: (identifier: string, pin: string, now: number, options?: { restore?: boolean }) => Promise<LoginOutcome>;
    /** ADR-048: Face ID/fingerprint resumes the session after the idle lock. */
    unlock?: (now: number) => Promise<boolean>;
  } | null;
  /** Server mode: the PIN was right; a new phone needs the second check next (ADR-054). */
  onSecondFactor?: () => void;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const s = useSession();
  const remembered = s.remembered;
  const [mode, setMode] = useState<Mode>(
    remembered?.includes("@") ? "email" : "phone",
  );
  const [country, setCountry] = useState<PhoneCountry>(
    remembered && !remembered.includes("@") ? splitPhone(remembered).country : "NG",
  );
  const [phone, setPhone] = useState(
    remembered && !remembered.includes("@") ? splitPhone(remembered).local : "",
  );
  const [email, setEmail] = useState(
    remembered?.includes("@") ? remembered : "",
  );
  const [pin, setPin] = useState("");
  const [remember, setRemember] = useState(remembered !== null);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);

  const [busy, setBusy] = useState(false);

  const submitToServer = async (id: string): Promise<void> => {
    if (!server) return;
    const typed = pin;
    setPin("");
    setBusy(true);
    const finish = (outcome: LoginOutcome): void => {
      session.setRemembered(remember ? id.trim() : null);
      if (outcome === "signedIn") onDone();
      else onSecondFactor?.();
    };
    try {
      finish(await server.login(id.trim(), typed, now()));
    } catch (e) {
      if (e instanceof ApiError && e.code === "AUTH_403_ACCOUNT_DELETING") {
        // ADR-095: the right PIN on an account being deleted; it can be restored.
        const until = typeof e.details?.restore_until === "string" ? new Date(e.details.restore_until) : null;
        Alert.alert(
          tr("Restore your account?"),
          until
            ? tr("You asked to delete this account. You can restore it until {{date}}. Your payout accounts and trusted phones need adding again.", { date: until.toLocaleDateString() })
            : tr("You asked to delete this account. You can still restore it. Your payout accounts and trusted phones need adding again."),
          [
            { text: tr("Cancel"), style: "cancel" },
            {
              text: tr("Restore"),
              onPress: () => {
                setBusy(true);
                server
                  .login(id.trim(), typed, now(), { restore: true })
                  .then(finish, (err: unknown) => setError(messageFor(err)))
                  .finally(() => setBusy(false));
              },
            },
          ],
        );
      } else setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (): void => {
    const id = mode === "phone" ? fullPhone(country, phone) : email;
    if (server) return void submitToServer(id);
    const r = session.logIn(id, pin, now(), remember);
    setPin("");
    if (r.ok) return onDone();
    if (r.reason === "invalid")
      setError(
        mode === "phone"
          ? tr("Enter your phone number")
          : tr("Enter a valid email address"),
      );
    else if (r.reason === "unavailable")
      setError(tr("Log-in isn’t available in this version of the app."));
    else if (r.reason === "locked")
      setError(
        tr("Too many wrong tries. Try again in {{value}} minutes.", { value: Math.max(1, Math.ceil((r.until - now()) / 60000)) }),
      );
    else
      setError(
        (r.triesLeft === 1 ? tr("Those details don’t match an account. 1 try left.") : tr("Those details don’t match an account. {{count}} tries left.", { count: r.triesLeft })),
      );
  };

  const serverUnlock = server?.unlock;
  const showFaceId = server ? Boolean(serverUnlock) && session.biometricSaved() : true;

  const faceId = async (): Promise<void> => {
    if (server) {
      if (!serverUnlock) return;
      setBusy(true);
      setError(null);
      try {
        if (await serverUnlock(now())) onDone();
      } catch (e) {
        setError(tr("{{message}} Log in with your PIN.", { message: messageFor(e) }));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!session.biometricOn()) {
      Alert.alert(
        tr("Face ID is off"),
        tr("Log in with your PIN first, then turn on Face ID for this phone."),
      );
      return;
    }
    const r = await biometrics(tr("Log in to Xspeeria"));
    if (r === "ok" && session.logInWithBiometrics(now())) onDone();
    else if (r === "unavailable")
      Alert.alert(
        tr("Not available"),
        tr("Face ID or fingerprint isn’t set up on this phone."),
      );
  };

  const fillDemo = (): void => {
    setMode("phone");
    setCountry("NG");
    setPhone(DEMO_ACCOUNT.phone.replace("+234", ""));
    setPin(DEMO_ACCOUNT.pin);
    setError(null);
  };

  return (
    <KeyboardAvoidingView
      testID="login-screen"
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + space.sm },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <AuthTop />
        <Heading
          title={tr("Welcome Back")}
          body={(mode === "phone" ? tr("Enter your phone number associated with your Xspeeria to log in") : tr("Enter your email address associated with your Xspeeria to log in"))}
        />
        <ModeTabs
          mode={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
        />
        {mode === "phone" ? (
          <OutlinedField label={tr("Phone Number")}>
            <PhoneInput
              testID="login-phone"
              country={country}
              value={phone}
              onChange={setPhone}
              onPickCountry={() => setPicker(true)}
            />
          </OutlinedField>
        ) : (
          <OutlinedField label={tr("Email Address")}>
            <FieldInput
              testID="login-email"
              accessibilityLabel={tr("Email address")}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              inputMode="text"
              maxLength={254}
              placeholder={tr("enter email address")}
            />
          </OutlinedField>
        )}
        <OutlinedField label={tr("PIN *")} invalid={Boolean(error)}>
          <FieldInput
            testID="login-pin"
            accessibilityLabel="PIN"
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, ""))}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={PIN_LENGTH}
            secure
          />
        </OutlinedField>
        <Pressable
          testID="login-forgot"
          accessibilityRole="link"
          onPress={onForgot}
          style={styles.forgot}
          hitSlop={8}
        >
          <Text style={styles.forgotText}>{tr("Forgot PIN?")}</Text>
        </Pressable>
        {error ? (
          <Text testID="login-error" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <CheckRow
          testID="login-remember"
          checked={remember}
          onToggle={() => setRemember((r) => !r)}
        >{tr("Remember me")}</CheckRow>

        {!showFaceId ? null : (
        <Pressable
          testID="login-faceid"
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void faceId()}
          style={styles.face}
        >
          <Icon name="scan" color={color.text.primary} size={30} />
          <Text style={styles.faceText}>{tr("Use face ID")}</Text>
        </Pressable>
        )}

        {s.endedBy ? (
          <Text testID="login-ended" style={styles.ended} accessibilityLiveRegion="polite">
            {s.endedBy === "idle"
              ? tr("For your security, we locked the app after 5 minutes without use. Log in again to continue.")
              : tr("Your session has ended after 7 days. Please log in with your PIN.")}
          </Text>
        ) : null}
        {server ? (
          <DemoNote testID="login-server">{tr("Development build connected to {{API_BASE_URL}}.", { API_BASE_URL: API_BASE_URL })}</DemoNote>
        ) : (
        <DemoNote testID="login-demo">{tr("Demo app: log in with {{phone}} or {{email}}, PIN {{pin}}.", { phone: DEMO_ACCOUNT.phone, email: DEMO_ACCOUNT.email, pin: DEMO_ACCOUNT.pin })}{" "}
          <Text
            testID="login-demo-fill"
            onPress={fillDemo}
            style={styles.demoLink}
          >{tr("Fill demo details")}</Text>
          {" · "}
          <Text
            testID="login-demo-us"
            onPress={() => {
              session.simulateRegion("US");
              fillDemo();
            }}
            style={styles.demoLink}
          >{tr("Log in as if from the United States")}</Text>
        </DemoNote>
        )}

        <View style={styles.actions}>
          <PrimaryButton
            testID="login-submit"
            label={tr("Login")}
            onPress={submit}
            disabled={pin.length !== PIN_LENGTH || busy}
          />
          <GhostButton
            testID="login-signup"
            label={tr("I don’t have a profile")}
            onPress={onSignUp}
          />
        </View>
      </ScrollView>

      <PhoneCountrySheet
        testID="login-country"
        visible={picker}
        onClose={() => setPicker(false)}
        onPick={setCountry}
      />
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => ({
  ended: { ...typography.body, fontSize: 14, color: color.text.secondary, marginTop: space.sm },
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  body: { paddingHorizontal: space.md, gap: space.sm },
  tabs: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: 28,
    padding: 4,
    marginTop: space.xs,
  },
  tab: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  tabOn: { backgroundColor: color.bg.sunken },
  tabText: { ...typography.body, fontSize: 15, color: color.text.secondary },
  tabTextOn: { ...brandWeight("700"), color: color.brand.primary },
  forgot: { alignSelf: "flex-end" },
  forgotText: {
    ...typography.caption,
    ...brandWeight("500"),
    color: color.success.text,
  },
  error: { ...typography.caption, color: color.error.text },
  face: { alignItems: "center", gap: 6, marginVertical: space.md },
  faceText: { ...typography.caption, color: color.text.primary },
  demoLink: { ...brandWeight("700"), textDecorationLine: "underline" },
  actions: { gap: 12, marginTop: space.xs },
}));
