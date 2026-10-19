/**
 * Change date of birth with proof (ADR-011). Date of birth is KYC-verified identity data,
 * so a change needs a photo of an ID document showing the new date. It is submitted for
 * review and the profile keeps the old date until the check approves it. MOCK: nothing is
 * uploaded; the document reference is dropped after submission.
 */

import { useState, type ReactElement } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/icons';
import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { FieldInput, OutlinedField } from '../market/controls';
import { longDate } from './data';
import { pickDocument, type PickOutcome } from './photos';
import { profileStore, useProfile } from './profileStore';
import { dobError, parseDob } from './verification';
import { tr } from "../../i18n";

/** Inserts slashes as the user types digits: `12071997` → `12/07/1997`. */
export function formatDobInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export function ChangeDobScreen({
  onBack,
  onDone,
  pick = pickDocument,
  now = () => new Date(),
}: {
  onBack: () => void;
  onDone: () => void;
  pick?: () => Promise<PickOutcome>;
  now?: () => Date;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const [value, setValue] = useState('');
  const [doc, setDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const attach = async (): Promise<void> => {
    try {
      const r = await pick();
      if (r.kind === 'picked') setDoc(r.uri);
      else if (r.kind === 'denied') Alert.alert(tr("Allow photo access"), tr("Allow Xspeeria to use your photos in your phone settings to add your document."));
    } catch {
      Alert.alert(tr("Could not use that photo"), tr("Please try again."));
    }
  };

  const submit = (): void => {
    const iso = parseDob(value);
    const problem = dobError(iso, now());
    if (problem || !iso) return setError(problem);
    if (iso === profile.dateOfBirth) return setError(tr("This is already your date of birth"));
    if (!doc) return setError(tr("Add a photo of your ID document"));
    profileStore.submitDob(iso, now().getTime());
    setDoc(null);
    setSubmitted(true);
  };

  return (
    <KeyboardAvoidingView
      testID="change-dob-screen"
      style={[styles.screen, { paddingTop: insets.top + space.xs }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable testID="change-dob-back" accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>{tr("Change date of birth")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {submitted ? (
          <>
            <Text testID="change-dob-done" style={styles.text}>{tr("Submitted for review. Your date of birth will change once our team has checked your document. We will let you know by email.")}</Text>
            <PrimaryButton testID="change-dob-finish" label={tr("Done")} onPress={onDone} />
          </>
        ) : (
          <>
            <Text style={styles.text}>{tr("Your date of birth is part of your verified identity ({{dateOfBirth}}). To change it, add a photo of your passport, driver’s licence or national ID showing the correct date.", { dateOfBirth: longDate(profile.dateOfBirth) })}</Text>
            <OutlinedField label={tr("New date of birth *")} invalid={Boolean(error) && !doc}>
              <FieldInput
                testID="change-dob-value"
                accessibilityLabel={tr("New date of birth, day month year")}
                value={value}
                onChangeText={(t) => {
                  setValue(formatDobInput(t));
                  setError(null);
                }}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={10}
                placeholder="DD/MM/YYYY"
              />
            </OutlinedField>
            <Pressable testID="change-dob-attach" accessibilityRole="button" onPress={() => void attach()} style={styles.attach}>
              <Icon name={doc ? 'check' : 'camera'} color={doc ? color.success.text : color.brand.primary} size={20} />
              <Text style={doc ? styles.attached : styles.attachText}>{doc ? tr("ID document added — tap to replace") : tr("Add ID document photo")}</Text>
            </Pressable>
            {error ? <Text testID="change-dob-error" style={styles.error}>{error}</Text> : null}
            <PrimaryButton testID="change-dob-submit" label={tr("Submit for review")} onPress={submit} disabled={value.length !== 10} />
            <Text style={styles.small}>{tr("Your document is used only for this check and is never shared in chat.")}</Text>
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
  attach: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.border.strong,
    borderRadius: 8,
    paddingHorizontal: space.sm,
  },
  attachText: { ...typography.body, ...brandWeight('700'), color: color.brand.primary },
  attached: { ...typography.body, ...brandWeight('700'), color: color.success.text },
  error: { ...typography.caption, color: color.error.text },
  small: { ...typography.caption, color: color.text.secondary },
}));
