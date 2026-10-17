/**
 * Change Password (Figma), ADR-007 A6.
 *
 * Three masked outlined fields and a navy "Change password" button. Passwords live only in
 * this component's state, are never logged or stored, and are cleared on submit. There is
 * no backend yet, so submitting explains that nothing was changed. The server will verify
 * the old password and apply the password policy (Open Decision 2).
 */

import { useState, type ReactElement } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/icons';
import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, typography } from '../../theme';
import { FieldInput, OutlinedField } from '../market/controls';
import { validatePasswordForm, type PasswordField, type PasswordForm } from './passwordForm';

const EMPTY: PasswordForm = { oldPassword: '', newPassword: '', confirmPassword: '' };

const FIELDS: readonly { key: PasswordField; label: string }[] = [
  { key: 'oldPassword', label: 'Enter Old Password' },
  { key: 'newPassword', label: 'Enter New Password' },
  { key: 'confirmPassword', label: 'Confirm New Password' },
];

export function ChangePasswordScreen({
  onBack,
  onSubmit,
}: {
  onBack: () => void;
  /** Receives the form once it passes client checks; the server decides the outcome. */
  onSubmit?: (form: PasswordForm) => void;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<PasswordForm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<PasswordField, string>>>({});

  const submit = (): void => {
    const found = validatePasswordForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const submitted = form;
    setForm(EMPTY);
    if (onSubmit) onSubmit(submitted);
    else
      Alert.alert(
        'Not available yet',
        'Password changes will work once sign-in is connected. Your password has not been changed.',
      );
  };

  return (
    <KeyboardAvoidingView
      testID="change-password-screen"
      style={[styles.screen, { paddingTop: insets.top + space.xs }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable testID="change-password-back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>Change Password</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {FIELDS.map((f, i) => (
          <View key={f.key} style={[styles.fieldWrap, i === 0 ? styles.firstField : null]}>
            <OutlinedField label={`${f.label} *`} invalid={Boolean(errors[f.key])}>
              <FieldInput
                testID={`password-${f.key}`}
                accessibilityLabel={f.label}
                value={form[f.key]}
                onChangeText={(t) => {
                  setForm((prev) => ({ ...prev, [f.key]: t }));
                  if (errors[f.key]) setErrors((e) => ({ ...e, [f.key]: undefined }));
                }}
                keyboardType="default"
                inputMode="text"
                maxLength={128}
                secure
              />
            </OutlinedField>
            {errors[f.key] ? (
              <Text testID={`password-error-${f.key}`} style={styles.error}>{errors[f.key]}</Text>
            ) : null}
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
        <PrimaryButton testID="change-password-submit" label="Change password" onPress={submit} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 44 },
  title: { flex: 1, textAlign: 'center', ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  headerSpacer: { width: 22 },
  body: { paddingHorizontal: space.md, paddingTop: space.md },
  fieldWrap: { marginBottom: space.sm },
  // Figma separates the old password from the new pair with extra space.
  firstField: { marginBottom: space.lg },
  error: { ...typography.caption, color: color.error.text, marginTop: 4 },
  footer: { paddingHorizontal: space.md, paddingTop: space.xs },
});
