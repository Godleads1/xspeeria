/**
 * New location (Figma 436:12247) and the US identity check (436:12428, 439:4008, 439:4218,
 * 439:4394), ADR-016.
 *
 * "Trade in Your New Location" → "Confirm & Create a new profile" → Verify Your Identity:
 * SSN, a photo of a valid ID (choose State ID Card / Passport / Driver's License), a selfie,
 * then Verify. The region is submitted for review (Pending). The SSN is masked, checked for
 * format only, never stored or logged, and cleared on submit. DEMO: the selfie match is
 * simulated and the document photo is not uploaded.
 */

import { useState, type ReactElement } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";

import { RoundFlag } from "../../components/flags";
import { Icon, type IconName } from "../../components/icons";
import { PrimaryButton } from "../../components/primitives";
import { brandWeight, color, space, themed, typography } from "../../theme";
import { FieldInput, OutlinedField } from "../market/controls";
import { pickDocument, type PickOutcome } from "../profile/photos";
import { DEMO_MODE } from "./demo";
import { AuthTop, DemoNote, GhostButton, Heading } from "./ui";
import { trRich } from "../../i18n/rich";
import { tr, k } from "../../i18n";

export const US_REGION = { flag: "USD", name: k("United States") } as const;

export type IdDocument = "state-id" | "passport" | "drivers-license";
export const ID_DOCUMENTS: readonly { key: IdDocument; label: string }[] = [
  { key: "state-id", label: k("State ID Card") },
  { key: "passport", label: k("Passport") },
  { key: "drivers-license", label: k("Driver’s License") },
];

/** `123456789` → `123-45-6789` as typed. */
export function formatSsn(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 9);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/** SSA structural rules: no 000/666/9xx area, no 00 group, no 0000 serial. Format only. */
export function isPlausibleSsn(ssn: string): boolean {
  const m = /^(\d{3})-?(\d{2})-?(\d{4})$/.exec(ssn);
  if (!m) return false;
  const [area, group, serial] = [m[1], m[2], m[3]];
  return (
    area !== "000" &&
    area !== "666" &&
    area[0] !== "9" &&
    group !== "00" &&
    serial !== "0000"
  );
}

/* ------------------------------------------------------------------ New location */

function LocationArt({ flag = "USD" }: { flag?: string }): ReactElement {
  return (
    <View
      style={styles.art}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={220} height={180} viewBox="0 0 220 180">
        <Ellipse
          cx={110}
          cy={100}
          rx={80}
          ry={72}
          fill={color.brand.secondarySurface}
        />
        <Path
          d="M40 120c30 40 120 30 140-20"
          stroke="#F87171"
          strokeWidth={6}
          fill="none"
          strokeLinecap="round"
          opacity={0.85}
        />
        <Path
          d="M150 30c-26 0-44 18-44 42 0 30 44 70 44 70s44-40 44-70c0-24-18-42-44-42z"
          fill="#4F46E5"
        />
        <Circle cx={150} cy={160} r={6} fill="#4F46E5" />
        <Circle cx={150} cy={72} r={30} fill="#FFFFFF" />
      </Svg>
      <View style={styles.flagSpot}>
        <RoundFlag code={flag} size={52} />
      </View>
    </View>
  );
}

export function NewLocationScreen({
  onConfirm,
  onSkip,
  place = { flag: "USD", name: tr("United States of America"), currency: "USD", detected: false },
}: {
  onConfirm: () => void;
  onSkip: () => void;
  /** ADR-042: the country the server suggests. Demo builds keep the Figma's USA. */
  place?: { flag: string; name: string; currency: string; detected: boolean };
}): ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="new-location-screen"
      style={[
        styles.screen,
        { paddingTop: insets.top, paddingBottom: insets.bottom + space.sm },
      ]}
    >
      <View style={styles.pad}>
        <AuthTop />
      </View>
      <View style={styles.center}>
        <LocationArt flag={place.flag} />
        <Text accessibilityRole="header" style={styles.locTitle}>{tr("Trade in Your New Location")}</Text>
        <Text style={styles.locBody}>{trRich("We’ve noticed you’re accessing your account from a new location and detected you’re in the <1>{{place}}</1>. Please confirm, and let us know if you’d like to create a profile that allows you to trade in {{currency}} for a smoother and more convenient experience.", { place: tr(place.name), currency: place.currency }, { 1: (s) => <Text style={styles.strong}>{s}</Text> })}</Text>
        {place.detected ? null : <DemoNote>{tr("Demo app: the location is simulated, not detected.")}</DemoNote>}
      </View>
      <View style={[styles.pad, styles.actions]}>
        <PrimaryButton
          testID="new-location-confirm"
          label={tr("Confirm & Create a new profile")}
          onPress={onConfirm}
        />
        <GhostButton testID="new-location-skip" label={tr("Skip")} onPress={onSkip} />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------- US identity check */

function TaskRow({
  icon,
  title,
  body,
  done,
  onPress,
  testID,
}: {
  icon: IconName;
  title: string;
  body: string;
  done: boolean;
  onPress: () => void;
  testID: string;
}): ReactElement {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${done ? tr("Done") : body}`}
      onPress={onPress}
      style={({ pressed }) => [styles.task, pressed ? styles.pressed : null]}
    >
      <Icon name={icon} color={color.text.primary} size={22} />
      <View style={styles.taskText}>
        <Text style={styles.taskTitle}>{title}</Text>
        <Text style={styles.taskBody}>{body}</Text>
      </View>
      {done ? (
        <View style={styles.doneDot}>
          <Icon name="check" color={color.text.onFill} size={11} weight={3} />
        </View>
      ) : (
        <Icon
          name="chevron"
          color={color.text.primary}
          size={14}
          weight={2.5}
        />
      )}
    </Pressable>
  );
}

export function VerifyRegionScreen({
  onDone,
  onCancel,
  pick = pickDocument,
  onSubmit,
}: {
  onDone: () => void;
  onCancel: () => void;
  pick?: () => Promise<PickOutcome>;
  /** Receives only what review needs; the SSN is not kept by the app. */
  onSubmit: (input: { document: IdDocument }) => void;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const [ssn, setSsn] = useState("");
  const [ssnError, setSsnError] = useState<string | null>(null);
  const [docType, setDocType] = useState<IdDocument | null>(null);
  const [docAdded, setDocAdded] = useState(false);
  const [selfie, setSelfie] = useState(false);
  const [picker, setPicker] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const chooseDoc = async (key: IdDocument): Promise<void> => {
    setPicker(false);
    try {
      const r = await pick();
      if (r.kind === "picked") {
        setDocType(key);
        setDocAdded(true);
      } else if (r.kind === "denied") {
        Alert.alert(
          tr("Allow photo access"),
          tr("Allow Xspeeria to use your photos in your phone settings to add your ID."),
        );
      }
    } catch {
      Alert.alert(tr("Could not use that photo"), tr("Please try again."));
    }
  };

  const takeSelfie = (): void => {
    if (!DEMO_MODE) return; // Real selfie capture needs the identity provider (ADR-016 §4).
    Alert.alert(
      tr("Demo selfie check"),
      tr("No identity provider is connected. In the real app your camera opens here and your selfie is matched to your ID photo."),
      [
        { text: tr("Cancel"), style: "cancel" },
        { text: tr("Continue as matched"), onPress: () => setSelfie(true) },
      ],
    );
  };

  const ready = ssn.length === 11 && docAdded && selfie;

  const verify = (): void => {
    if (!isPlausibleSsn(ssn)) {
      setSsnError(tr("Enter a valid 9-digit Social Security Number"));
      return;
    }
    if (!docType) return;
    onSubmit({ document: docType });
    setSsn(""); // never kept
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <View
        testID="verify-region-done"
        style={[
          styles.screen,
          styles.pad,
          {
            paddingTop: insets.top + space.lg,
            paddingBottom: insets.bottom + space.sm,
          },
        ]}
      >
        <View style={styles.center}>
          <RoundFlag code="USD" size={56} />
          <Text accessibilityRole="header" style={styles.locTitle}>{tr("Submitted for review")}</Text>
          <Text style={styles.locBody}>{tr("We’ll review your documents and let you know by email. Your United States profile shows as Pending in Account details until then.")}</Text>
        </View>
        <PrimaryButton
          testID="verify-region-finish"
          label={tr("Continue")}
          onPress={onDone}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      testID="verify-region-screen"
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.pad, styles.body]}
        keyboardShouldPersistTaps="handled"
      >
        <AuthTop />
        <Heading
          title={tr("Verify Your Identity")}
          body={tr("To trade in USD, we need to confirm your identity in the United States. Enter your Social Security Number, then add a photo of a valid ID and a selfie.")}
        />
        <OutlinedField label={tr("Enter SSN *")} invalid={Boolean(ssnError)}>
          <FieldInput
            testID="verify-region-ssn"
            accessibilityLabel={tr("Social Security Number")}
            value={ssn}
            onChangeText={(t) => {
              setSsn(formatSsn(t));
              setSsnError(null);
            }}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={11}
            secure
            noAutofill
            placeholder="enter"
          />
        </OutlinedField>
        {ssnError ? (
          <Text testID="verify-region-ssn-error" style={styles.error}>
            {ssnError}
          </Text>
        ) : null}
        <TaskRow
          testID="verify-region-id"
          icon="idcard"
          title={tr("Take A picture of your Valid ID")}
          body={
            docType
              ? tr("{{label}} added", { label: tr(ID_DOCUMENTS.find((d) => d.key === docType)?.label ?? "") })
              : tr("To check your personal information is correct")
          }
          done={docAdded}
          onPress={() => setPicker(true)}
        />
        <TaskRow
          testID="verify-region-selfie"
          icon="camera"
          title={tr("Take A selfie of yourself")}
          body={tr("To match your face to your ID photo")}
          done={selfie}
          onPress={takeSelfie}
        />
        <Text style={styles.small}>{tr("Your SSN is sent once for this check and never stored on your phone.")}</Text>
      </ScrollView>
      <View
        style={[
          styles.pad,
          styles.actions,
          { paddingBottom: insets.bottom + space.sm },
        ]}
      >
        <PrimaryButton
          testID="verify-region-submit"
          label={tr("Verify")}
          onPress={verify}
          disabled={!ready}
        />
        <GhostButton
          testID="verify-region-cancel"
          label={tr("Cancel")}
          onPress={onCancel}
        />
      </View>

      <Modal
        visible={picker}
        animationType="slide"
        onRequestClose={() => setPicker(false)}
      >
        <View
          testID="document-picker"
          style={[styles.screen, styles.pad, { paddingTop: insets.top }]}
        >
          <AuthTop onBack={() => setPicker(false)} />
          <Heading
            title={tr("Verify Your Identity")}
            body={tr("Please select a document below")}
          />
          {ID_DOCUMENTS.map((d) => (
            <Pressable
              key={d.key}
              testID={`document-${d.key}`}
              accessibilityRole="button"
              onPress={() => void chooseDoc(d.key)}
              style={({ pressed }) => [
                styles.docRow,
                pressed ? styles.pressed : null,
              ]}
            >
              <Icon name="idcard" color={color.text.primary} size={22} />
              <Text style={styles.docLabel}>{tr(d.label)}</Text>
              <Icon
                name="chevron"
                color={color.text.primary}
                size={14}
                weight={2.5}
              />
            </Pressable>
          ))}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  pad: { paddingHorizontal: space.md },
  body: { gap: space.sm, paddingBottom: space.md },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  art: { width: 220, height: 180 },
  flagSpot: { position: "absolute", left: 124, top: 46 },
  locTitle: {
    ...typography.headline,
    ...brandWeight("700"),
    fontSize: 18,
    color: color.text.primary,
    textAlign: "center",
  },
  locBody: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 21,
    color: color.text.primary,
    textAlign: "center",
  },
  strong: { ...brandWeight("700") },
  actions: { gap: 12 },
  task: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  pressed: { backgroundColor: color.bg.sunken },
  taskText: { flex: 1, gap: 2 },
  taskTitle: {
    ...typography.body,
    ...brandWeight("500"),
    fontSize: 14,
    color: color.text.primary,
  },
  taskBody: {
    ...typography.caption,
    fontSize: 12,
    color: color.text.secondary,
  },
  doneDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: color.success.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { ...typography.caption, color: color.error.text },
  small: { ...typography.caption, color: color.text.secondary },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  docLabel: {
    flex: 1,
    ...typography.body,
    fontSize: 15,
    color: color.text.primary,
  },
}));
