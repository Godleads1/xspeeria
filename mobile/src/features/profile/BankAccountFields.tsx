/**
 * The bank-details fields for one payout country (Figma "Account Details"), shared by Add
 * Beneficiary and Payout Destination's "Send to a new recipient" so both validate the same
 * way. Fields come from BANK_FORMS; validation is validateBankForm (format checks for the
 * user's convenience only — the server and partner bank are authoritative). The account
 * holder's name is never typed: it must be the user's own KYC name (Banking spec §3.3).
 */

import { useState, type ReactElement } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '../../components/icons';
import { color, typography, themed } from '../../theme';
import { ActionSheet, FieldInput, OutlinedField } from '../market/controls';
import { ACCOUNT_TYPES, BANK_FORMS, type BankField, type BankFieldKey, type BankFormValues } from './data';
import { tr } from "../../i18n";

export function BankAccountFields({
  currency,
  values,
  errors,
  onChange,
}: {
  currency: string;
  values: BankFormValues;
  errors: Partial<Record<BankFieldKey, string>>;
  onChange: (key: BankFieldKey, value: string) => void;
}): ReactElement {
  const fields = BANK_FORMS[currency] ?? [];
  const [typeSheet, setTypeSheet] = useState(false);

  const set = (f: BankField, raw: string): void => {
    onChange(f.key, f.kind === 'digits' ? raw.replace(/\D/g, '') : raw);
  };

  return (
    <>
      {fields.map((f) => {
        const error = errors[f.key];
        return (
          <View key={f.key} style={styles.fieldWrap}>
            <OutlinedField label={`${tr(f.label)} *`} invalid={Boolean(error)}>
              {f.kind === 'select' ? (
                <Pressable
                  testID={`field-${f.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${tr(f.label)}${values[f.key] ? `, ${values[f.key]}` : ''}`}
                  onPress={() => setTypeSheet(true)}
                  style={styles.select}
                >
                  <Text style={values[f.key] ? styles.selectValue : styles.selectPlaceholder}>{values[f.key] ?? 'select'}</Text>
                  <Icon name="chevron" color={color.text.secondary} size={14} weight={2} />
                </Pressable>
              ) : (
                <FieldInput
                  testID={`field-${f.key}`}
                  accessibilityLabel={tr(f.label)}
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
      <ActionSheet
        testID="account-type-sheet"
        visible={typeSheet}
        onClose={() => setTypeSheet(false)}
        actions={ACCOUNT_TYPES.map((t) => ({
          key: t,
          label: t,
          onPress: () => {
            onChange('accountType', t);
            setTypeSheet(false);
          },
        }))}
      />
    </>
  );
}

const styles = themed(() => ({
  fieldWrap: { marginBottom: 12 },
  select: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  selectValue: { ...typography.body, fontSize: 16, color: color.text.primary },
  selectPlaceholder: { ...typography.body, fontSize: 16, color: color.text.disabled },
  error: { ...typography.caption, color: color.error.text, marginTop: 4 },
}));
