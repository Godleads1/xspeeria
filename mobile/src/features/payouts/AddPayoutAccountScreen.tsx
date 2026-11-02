/**
 * Add a payout account (server builds, ADR-036). Reuses the approved bank-details fields
 * (ADR-022) and their format checks; the server checks again and asks the bank to confirm
 * the account (a pretend check on a developer's computer). The holder's name is never typed:
 * it comes from the bank. Needs "Confirm it's you" (ADR-054).
 *
 * ADR-083 (owner, 2026-11-02): the account may be anyone's -- a school's for fees, say -- so
 * the person confirms twice that it is exactly the account they mean: the details they typed,
 * before anything is sent, then the holder's name the bank returns. "No, remove it" takes it
 * straight back out.
 */

import { useState, type ReactElement } from 'react';
import { Pressable, Text, View } from 'react-native';

import { messageFor } from '../../api/client';
import type { NewPayoutAccount, ServerPayoutAccount } from '../../api/payoutsApi';
import { Icon } from '../../components/icons';
import { PrimaryButton, Screen } from '../../components/primitives';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { BankAccountFields } from '../profile/BankAccountFields';
import { validateBankForm, type BankFormValues } from '../profile/data';
import { confirmIdentity, type ConfirmIdentity } from '../security/serverConfirm';
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
  confirmWith = confirmIdentity,
}: {
  source: PayoutSource;
  /** Tests inject this. */
  confirmWith?: ConfirmIdentity;
  initialCurrency?: string;
  onBack: () => void;
  onAdded: () => void;
}): ReactElement {
  const [currency, setCurrency] = useState<string>(
    (PAYOUT_CURRENCIES as readonly string[]).includes(initialCurrency) ? initialCurrency : 'NGN',
  );
  const [values, setValues] = useState<BankFormValues>({});
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** ADR-083: 'review' -- check what was typed; 'name' -- check the name the bank returned. */
  const [step, setStep] = useState<'form' | 'review' | 'name'>('form');
  const [added, setAdded] = useState<ServerPayoutAccount | null>(null);

  const errors = validateBankForm(currency, values);
  const valid = Object.keys(errors).length === 0;

  const review = (): void => {
    setShown(true);
    if (!valid) return;
    setError(null);
    setStep('review');
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const approval = await confirmWith('beneficiary.add', tr("Add a {{currency}} payout account.", { currency }));
      if (!approval) return;
      const account = await source.add(toNewAccount(currency, values), approval);
      setValues({}); // the full number leaves memory as soon as it is sent
      setAdded(account);
      setStep('name');
    } catch (e) {
      setError(messageFor(e));
      setStep('form');
    } finally {
      setBusy(false);
    }
  };

  /** "That's not who I meant": take the account straight back out. */
  const removeAdded = async (): Promise<void> => {
    if (!added) return;
    setBusy(true);
    setError(null);
    try {
      const approval = await confirmWith(
        'beneficiary.remove',
        tr("Remove {{bank_name}} •••• {{account_last4}}. Deals that already use it keep it.", { bank_name: added.bank_name, account_last4: added.account_last4 }),
      );
      if (!approval) return;
      await source.remove(added.payout_account_id, approval);
      setAdded(null);
      setStep('form');
      setError(tr("Removed. Check the account number and add it again."));
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'review') {
    const rows: [string, string][] = [
      [tr("Currency"), currency],
      [tr("Bank"), (values.bankName ?? '').trim()],
      [tr("Account number"), (values.accountNumber ?? '').trim()],
    ];
    if (values.routingNumber) rows.push([tr("Routing number"), values.routingNumber.trim()]);
    if (values.sortCode) rows.push([tr("Sort code"), values.sortCode.trim()]);
    if (values.accountType) rows.push([tr("Account type"), values.accountType]);
    return (
      <Screen testID="add-payout-review">
        <Text accessibilityRole="header" style={styles.title}>{tr("Check the account")}</Text>
        <Text style={styles.intro}>
          {tr("Check every digit. Your money is paid exactly here, and a payment to a wrong account may not come back.")}
        </Text>
        <View style={styles.card}>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>{label}</Text>
              <Text testID={`add-payout-review-${label}`} style={styles.reviewValue}>{value}</Text>
            </View>
          ))}
        </View>
        {error ? <Text testID="add-payout-error" accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <PrimaryButton
          testID="add-payout-confirm"
          label={busy ? tr("Checking with the bank…") : tr("Yes, add this account")}
          onPress={() => void save()}
          disabled={busy}
        />
        <Pressable testID="add-payout-edit" accessibilityRole="button" onPress={() => setStep('form')} hitSlop={8} disabled={busy}>
          <Text style={styles.link}>{tr("Edit the details")}</Text>
        </Pressable>
      </Screen>
    );
  }

  if (step === 'name' && added) {
    return (
      <Screen testID="add-payout-name">
        <Text accessibilityRole="header" style={styles.title}>{tr("Who is this account?")}</Text>
        {added.account_name ? (
          <>
            <Text style={styles.intro}>{tr("Your bank says this account belongs to:")}</Text>
            <View style={styles.card}>
              <Text testID="add-payout-holder" style={styles.holder}>{added.account_name}</Text>
              <Text style={styles.reviewLabel}>{`${added.bank_name} •••• ${added.account_last4} · ${added.currency}`}</Text>
            </View>
            <Text style={styles.intro}>{tr("Is this the person or business you want paid?")}</Text>
          </>
        ) : (
          <Text testID="add-payout-holder-pending" style={styles.intro}>
            {tr("Your bank hasn’t confirmed the account holder’s name yet. You’ll see it in Payout accounts before the account can be used.")}
          </Text>
        )}
        {error ? <Text testID="add-payout-error" accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <PrimaryButton testID="add-payout-name-ok" label={added.account_name ? tr("Yes, that’s right") : tr("Done")} onPress={onAdded} disabled={busy} />
        {added.account_name ? (
          <Pressable testID="add-payout-name-wrong" accessibilityRole="button" onPress={() => void removeAdded()} hitSlop={8} disabled={busy}>
            <Text style={styles.link}>{tr("No, remove it")}</Text>
          </Pressable>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen testID="add-payout-account-screen">
      <View style={styles.header}>
        <Pressable testID="add-payout-back" accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{tr("Add payout account")}</Text>
        <View style={styles.spacer} />
      </View>
      <Text style={styles.intro}>{tr("It can be your own account or someone else’s, for example a school’s. Your bank confirms the account holder’s name. Only the last 4 digits are kept visible.")}</Text>

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

      {error ? (
        <Text testID="add-payout-error" accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <PrimaryButton
        testID="add-payout-save"
        label={tr("Add account")}
        onPress={review}
        disabled={busy}
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
  card: { gap: 8, padding: space.sm, borderRadius: 12, borderWidth: 1, borderColor: color.border.subtle },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  reviewLabel: { ...typography.caption, fontSize: 13, color: color.text.secondary },
  reviewValue: { ...typography.body, ...brandWeight('700'), fontSize: 15, color: color.text.primary, flexShrink: 1, textAlign: 'right' },
  holder: { ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  link: { ...typography.body, ...brandWeight('700'), fontSize: 14, color: color.brand.primary, textAlign: 'center' },
}));
