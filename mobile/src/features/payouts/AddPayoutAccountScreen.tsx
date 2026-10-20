/**
 * Add a payout account (server builds, ADR-036). Reuses the approved bank-details fields
 * (ADR-022) and their format checks; the server checks again and asks the bank to confirm
 * the account (a pretend check on a developer's computer). The holder's name is never typed:
 * it comes from the bank. Needs your authenticator code.
 */

import { useState, type ReactElement } from 'react';
import { Pressable, Text, View } from 'react-native';

import { messageFor } from '../../api/client';
import type { NewPayoutAccount } from '../../api/payoutsApi';
import { Icon } from '../../components/icons';
import { PrimaryButton, Screen } from '../../components/primitives';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { FieldInput, OutlinedField } from '../market/controls';
import { BankAccountFields } from '../profile/BankAccountFields';
import { validateBankForm, type BankFormValues } from '../profile/data';
import type { PayoutSource } from './serverPayouts';
import { tr } from "../../i18n";

/** Currencies with an approved account form. EUR waits for its form (ADR-035). */
export const PAYOUT_CURRENCIES = ['NGN', 'USD', 'GBP'] as const;

export function toNewAccount(currency: string, v: BankFormValues): NewPayoutAccount {
  const out: NewPayoutAccount = {
    currency,
    bank_name: (v.bankName ?? '').trim(),
    account_number: (v.accountNumber ?? '').trim(),
  };
  if (v.routingNumber) out.routing_number = v.routingNumber.trim();
  if (v.sortCode) out.sort_code = v.sortCode.trim();
  if (v.accountType) out.account_type = v.accountType;
  return out;
}

export function AddPayoutAccountScreen({
  source,
  initialCurrency = 'NGN',
  onBack,
  onAdded,
}: {
  source: PayoutSource;
  initialCurrency?: string;
  onBack: () => void;
  onAdded: () => void;
}): ReactElement {
  const [currency, setCurrency] = useState<string>(
    (PAYOUT_CURRENCIES as readonly string[]).includes(initialCurrency) ? initialCurrency : 'NGN',
  );
  const [values, setValues] = useState<BankFormValues>({});
  const [shown, setShown] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = validateBankForm(currency, values);
  const valid = Object.keys(errors).length === 0;

  const save = async (): Promise<void> => {
    setShown(true);
    if (!valid || code.length !== 6) return;
    setBusy(true);
    setError(null);
    const typed = code;
    setCode(''); // each code works once
    try {
      await source.add(toNewAccount(currency, values), typed);
      setValues({}); // the full number leaves memory as soon as it is sent
      onAdded();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="add-payout-account-screen">
      <View style={styles.header}>
        <Pressable testID="add-payout-back" accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{tr("Add payout account")}</Text>
        <View style={styles.spacer} />
      </View>
      <Text style={styles.intro}>{tr("It must be in your own name — your bank confirms the name. Only the last 4 digits are kept visible.")}</Text>

      <View style={styles.tabs} accessibilityRole="tablist">
        {PAYOUT_CURRENCIES.map((c) => (
          <Pressable
            key={c}
            testID={`add-payout-currency-${c}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: c === currency }}
            onPress={() => {
              setCurrency(c);
              setValues({});
              setShown(false);
            }}
            style={[styles.tab, c === currency ? styles.tabOn : null]}
          >
            <Text style={[styles.tabText, c === currency ? styles.tabTextOn : null]}>{c}</Text>
          </Pressable>
        ))}
      </View>

      <BankAccountFields
        currency={currency}
        values={values}
        errors={shown ? errors : {}}
        onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
      />

      <OutlinedField label={tr("Authenticator code *")}>
        <FieldInput
          testID="add-payout-code"
          accessibilityLabel={tr("6-digit code from your authenticator app")}
          value={code}
          onChangeText={(t) => {
            setCode(t.replace(/[^0-9]/g, '').slice(0, 6));
            setError(null);
          }}
          placeholder="123456"
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={6}
        />
      </OutlinedField>
      {error ? (
        <Text testID="add-payout-error" accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <PrimaryButton
        testID="add-payout-save"
        label={busy ? tr("Checking with the bank…") : tr("Add account")}
        onPress={() => void save()}
        disabled={busy || code.length !== 6}
      />
    </Screen>
  );
}

const styles = themed(() => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 24 },
  title: { ...brandWeight('700'), fontSize: 20, color: color.text.primary },
  intro: { ...typography.caption, fontSize: 13, color: color.text.secondary },
  tabs: { flexDirection: 'row', gap: space.xs },
  tab: {
    paddingHorizontal: space.sm,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.border.strong,
  },
  tabOn: { backgroundColor: color.brand.primary, borderColor: color.brand.primary },
  tabText: { ...typography.body, ...brandWeight('700'), fontSize: 14, color: color.text.primary },
  tabTextOn: { color: color.text.onFill },
  error: { ...typography.caption, fontSize: 13, color: color.error.text },
}));
