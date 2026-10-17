/**
 * Manage Beneficiaries → country → Account Details (Figma), ADR-007 A3.
 *
 * Outlined fields for the chosen country's bank format, a read-only Account Name that the
 * partner bank confirms (Banking spec v1.1 §3.3), and "Add Beneficiary". Format checks
 * here are for the user's convenience only; the server and partner bank are authoritative.
 * Only the last 4 digits are kept on the device. MOCK DATA ONLY.
 */

import { useState, type ReactElement } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/icons';
import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, typography } from '../../theme';
import { ActionSheet, FieldInput, OutlinedField } from '../market/controls';
import type { StepUp } from '../security/stepUp';
import { beneficiaryStore } from './beneficiaryStore';
import {
  ACCOUNT_TYPES,
  BANK_FORMS,
  PROFILE_USER,
  validateBankForm,
  type Beneficiary,
  type BankField,
  type BankFieldKey,
  type BankFormValues,
} from './data';

export function AddBeneficiaryScreen({
  currency,
  onBack,
  onDone,
  stepUp,
}: {
  /** Must already be validated against DESTINATION_COUNTRIES by the route. */
  currency: string;
  onBack: () => void;
  onDone: (added: Beneficiary) => void;
  /** ADR-008: 2FA re-check before adding a beneficiary. */
  stepUp: StepUp;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const fields = BANK_FORMS[currency] ?? [];
  const [values, setValues] = useState<BankFormValues>({});
  const [errors, setErrors] = useState<Partial<Record<BankFieldKey, string>>>({});
  const [typeSheet, setTypeSheet] = useState(false);

  const set = (f: BankField, raw: string): void => {
    const next = f.kind === 'digits' ? raw.replace(/\D/g, '') : raw;
    setValues((v) => ({ ...v, [f.key]: next }));
    if (errors[f.key]) setErrors((e) => ({ ...e, [f.key]: undefined }));
  };

  const submit = async (): Promise<void> => {
    const found = validateBankForm(currency, values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (!(await stepUp(`Add a ${currency} account at ${(values.bankName ?? '').trim()}`))) return;
    const added = beneficiaryStore.add({
      currency,
      bank: values.bankName ?? '',
      accountNumber: values.accountNumber ?? '',
      // The account must be in the user's own KYC name (§3.3); the bank confirms it.
      name: PROFILE_USER.fullName,
    });
    setValues({});
    onDone(added);
  };

  return (
    <KeyboardAvoidingView
      testID="add-beneficiary-screen"
      style={[styles.screen, { paddingTop: insets.top + space.xs }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable testID="add-beneficiary-back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>Manage Beneficiaries</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={styles.section}>Account Details</Text>

        {fields.map((f) => {
          const label = `${f.label} *`;
          const error = errors[f.key];
          return (
            <View key={f.key} style={styles.fieldWrap}>
              <OutlinedField label={label} invalid={Boolean(error)}>
                {f.kind === 'select' ? (
                  <Pressable
                    testID={`field-${f.key}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${f.label}${values[f.key] ? `, ${values[f.key]}` : ''}`}
                    onPress={() => setTypeSheet(true)}
                    style={styles.select}
                  >
                    <Text style={values[f.key] ? styles.selectValue : styles.selectPlaceholder}>{values[f.key] ?? 'select'}</Text>
                    <Icon name="chevron" color={color.text.secondary} size={14} weight={2} />
                  </Pressable>
                ) : (
                  <FieldInput
                    testID={`field-${f.key}`}
                    accessibilityLabel={f.label}
                    value={values[f.key] ?? ''}
                    onChangeText={(t) => set(f, t)}
                    keyboardType={f.kind === 'digits' ? 'number-pad' : 'default'}
                    inputMode={f.kind === 'digits' ? 'numeric' : 'text'}
                    maxLength={f.maxLength}
                  />
                )}
              </OutlinedField>
              {error ? (
                <Text testID={`error-${f.key}`} style={styles.error}>{error}</Text>
              ) : null}
            </View>
          );
        })}

        <View style={styles.fieldWrap}>
          <OutlinedField label="Account Name">
            <View style={styles.select} accessible accessibilityLabel="Account Name. Confirmed by your bank after you add the account">
              <Text style={styles.selectPlaceholder}>Confirmed by your bank</Text>
            </View>
          </OutlinedField>
          <Text style={styles.help}>You can only add accounts in your own name ({PROFILE_USER.fullName}).</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
        <PrimaryButton testID="add-beneficiary-submit" label="Add Beneficiary" onPress={() => void submit()} />
      </View>

      <ActionSheet
        testID="account-type-sheet"
        visible={typeSheet}
        onClose={() => setTypeSheet(false)}
        actions={ACCOUNT_TYPES.map((t) => ({
          key: t,
          label: t,
          onPress: () => {
            setValues((v) => ({ ...v, accountType: t }));
            setErrors((e) => ({ ...e, accountType: undefined }));
            setTypeSheet(false);
          },
        }))}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 44 },
  title: { flex: 1, textAlign: 'center', ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  headerSpacer: { width: 22 },
  body: { paddingHorizontal: space.md, paddingBottom: space.lg },
  section: {
    ...typography.body,
    fontSize: 14,
    color: color.text.secondary,
    paddingTop: space.sm,
    paddingBottom: 6,
    marginBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
  fieldWrap: { marginBottom: space.sm },
  select: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  selectValue: { ...typography.body, fontSize: 16, color: color.text.primary },
  selectPlaceholder: { ...typography.body, fontSize: 16, color: color.text.disabled },
  error: { ...typography.caption, color: color.error.text, marginTop: 4 },
  help: { ...typography.caption, color: color.text.secondary, marginTop: 6 },
  footer: { paddingHorizontal: space.md, paddingTop: space.xs },
});
