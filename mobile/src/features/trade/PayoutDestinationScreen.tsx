/**
 * Payout Destination (Figma "Payout Destination" / "Send to a New Receipent"), ADR-022.
 *
 * Where the money the user receives is paid: one or more of their own accounts, each with
 * an amount; the amounts must add up exactly to the total (ADR-021). The partner bank pays
 * each account from escrow; Xspeeria never holds the money.
 *
 * Enterprise-standard deviations from Figma, on purpose:
 * - No "Available Balance" wording (Standing Standards §2: no balance or wallet). The amount
 *   still to place is "Left to assign".
 * - Accounts must be in the user's own name (Banking spec §3.3); payouts to other people
 *   wait for DEC-007. The account name is never typed: the bank confirms it.
 * - Account numbers are shown and kept as the last 4 digits only.
 * - A new account is paid as soon as both sides have paid in (DEC-044), and is saved as a
 *   beneficiary only if the user asks, after the 2FA check on Continue.
 * - "Fund Card" is shown but cards are not available yet (ADR-012).
 * Everything here is re-checked by the server; nothing on this screen is trusted.
 */

import { useState, type ReactElement } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/icons';
import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { ActionSheet, FieldInput, OutlinedField, RoundButton } from '../market/controls';
import { formatHundredths, parseToHundredths } from '../market/money';
import { BankAccountFields } from '../profile/BankAccountFields';
import { BANK_FORMS, validateBankForm, type BankFieldKey, type BankFormValues, type Beneficiary } from '../profile/data';
import { splitProblem } from './payoutSplit';
import { tr } from "../../i18n";

export interface Recipient {
  /** Unique within this screen. */
  readonly key: string;
  readonly id: string;
  readonly name: string;
  readonly bank: string;
  readonly last4: string;
  /** Minor units of the currency received. */
  readonly amountMinor: number;
  /** Added here, not yet verified by the bank. */
  readonly isNew: boolean;
  /** Save it as a beneficiary once the order is confirmed. */
  readonly save: boolean;
}

/** What to show under the list: what is left to place, or by how much it is over. */
export function assignmentMessage(totalMinor: number, recipients: readonly Recipient[], currency: string): string | null {
  const assigned = recipients.reduce((sum, r) => sum + r.amountMinor, 0);
  if (recipients.length === 0) return tr("Add an account to receive {{totalMinor}} {{currency}}.", { totalMinor: formatHundredths(totalMinor), currency });
  if (assigned > totalMinor) return tr("That is {{totalMinor}} {{currency}} more than you receive.", { totalMinor: formatHundredths(assigned - totalMinor), currency });
  if (assigned < totalMinor) return tr("Left to assign: {{assigned}} {{currency}}.", { assigned: formatHundredths(totalMinor - assigned), currency });
  return null;
}

export function PayoutDestinationScreen({
  totalMinor,
  currency,
  ownerName,
  savedAccounts,
  onBack,
  onContinue,
  onManageBeneficiaries,
}: {
  /** What the user receives, minor units of `currency`. */
  totalMinor: number;
  /** The currency received (the one bought, or NGN when selling). */
  currency: string;
  /** The user's KYC name: every payout account must be in this name. */
  ownerName: string;
  /** The user's own verified accounts in `currency`. */
  savedAccounts: readonly Beneficiary[];
  onBack: () => void;
  onContinue: (recipients: readonly Recipient[]) => void;
  onManageBeneficiaries?: () => void;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const [recipients, setRecipients] = useState<readonly Recipient[]>([]);
  const [menu, setMenu] = useState(false);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [nextNew, setNextNew] = useState(1);

  const assigned = recipients.reduce((sum, r) => sum + r.amountMinor, 0);
  const left = Math.max(0, totalMinor - assigned);
  const problem = splitProblem(totalMinor, recipients);
  const message = assignmentMessage(totalMinor, recipients, currency);
  const unused = savedAccounts.filter((b) => !recipients.some((r) => r.id === b.id));

  const addSaved = (b: Beneficiary): void => {
    // Takes what is left; if nothing is left, the user sets the amount.
    const r: Recipient = { key: b.id, id: b.id, name: b.name, bank: b.bank, last4: b.accountLast4, amountMinor: left, isNew: false, save: false };
    setRecipients((list) => [...list, r]);
    if (left === 0) setEditing(r.key);
  };

  const setAmount = (key: string, amountMinor: number): void =>
    setRecipients((list) => list.map((r) => (r.key === key ? { ...r, amountMinor } : r)));

  const remove = (key: string): void => setRecipients((list) => list.filter((r) => r.key !== key));

  const requestCard = (): void =>
    Alert.alert(tr("Cards aren’t available yet"), tr("A prepaid {{currency}} card is coming later. For now, choose a bank account in your name.", { currency }));

  const editingRecipient = recipients.find((r) => r.key === editing) ?? null;

  return (
    <View testID="payout-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
      <View style={styles.header}>
        <Pressable testID="payout-back" accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={onBack} hitSlop={12} style={styles.headerSide}>
          <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{tr("Payout Destination")}</Text>
        <RoundButton icon="more" label={tr("More options")} testID="payout-more" onPress={() => setMenu(true)} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.totalRow} accessible accessibilityLabel={tr("Total amount {{totalMinor}} {{currency}}", { totalMinor: formatHundredths(totalMinor), currency })}>
          <Text style={styles.totalLabel}>{tr("Total Amount")}</Text>
          <Text testID="payout-total" style={styles.totalValue}>{`${formatHundredths(totalMinor)} ${currency}`}</Text>
        </View>

        <Text accessibilityRole="header" style={styles.section}>{tr("Fund Card")}</Text>
        <Text style={styles.text}>
          {tr("A prepaid card funded with your exchanged currency, ready to collect at your destination. Cards aren’t available yet.")}
        </Text>
        <Pressable testID="payout-card" accessibilityRole="button" onPress={requestCard} style={styles.linkRow} hitSlop={6}>
          <Icon name="cards" color={color.success.text} size={16} />
          <Text style={styles.link}>{tr("Request a {{currency}} card", { currency })}</Text>
        </Pressable>

        <Text accessibilityRole="header" style={styles.section}>{tr("Fund Account")}</Text>
        <Text style={styles.text}>
          {tr("You can add several accounts to be paid in a single transaction. All accounts must be in {{currency}} and in your own name ({{ownerName}}).", { currency, ownerName })}
        </Text>
        <Pressable testID="payout-new" accessibilityRole="button" onPress={() => setAdding(true)} style={styles.newLink} hitSlop={6}>
          <Text style={styles.link}>{tr("Send to a new recipient →")}</Text>
        </Pressable>

        {recipients.map((r) => (
          <View key={r.key} testID={`payout-recipient-${r.key}`} style={styles.card}>
            <View style={styles.cardMain}>
              <Text style={styles.cardName}>{r.name}</Text>
              <Text style={styles.cardBank}>{`${r.bank} •••• ${r.last4}`}</Text>
              {r.isNew ? (
                <Text testID={`payout-hold-${r.key}`} style={styles.hold}>{tr("New account: confirmed with your authenticator code")}</Text>
              ) : null}
            </View>
            <Text testID={`payout-amount-${r.key}`} style={styles.cardAmount}>{`${formatHundredths(r.amountMinor)} ${currency}`}</Text>
            <Pressable
              testID={`payout-menu-${r.key}`}
              accessibilityRole="button"
              accessibilityLabel={tr("Options for account ending {{last4}}", { last4: r.last4 })}
              onPress={() => setRowMenu(r.key)}
              hitSlop={10}
              style={styles.kebab}
            >
              <Icon name="more" color={color.text.secondary} size={18} />
            </Pressable>
          </View>
        ))}

        {unused.length > 0 ? (
          <>
            <Text style={styles.subhead}>{tr("Your saved accounts")}</Text>
            {unused.map((b) => (
              <Pressable
                key={b.id}
                testID={`payout-saved-${b.id}`}
                accessibilityRole="button"
                accessibilityLabel={tr("Add {{bank}} account ending {{accountLast4}}", { bank: b.bank, accountLast4: b.accountLast4 })}
                onPress={() => addSaved(b)}
                style={styles.saved}
              >
                <View style={styles.cardMain}>
                  <Text style={styles.cardName}>{b.name}</Text>
                  <Text style={styles.cardBank}>{`${b.bank} •••• ${b.accountLast4}`}</Text>
                </View>
                <Icon name="plus" color={color.brand.primary} size={18} />
              </Pressable>
            ))}
          </>
        ) : recipients.length === 0 ? (
          <View testID="payout-empty" style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="people" color={color.text.disabled} size={28} />
            </View>
            <Text style={styles.emptyText}>{tr("No saved Beneficiary to show")}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
        {message ? (
          <Text testID="payout-message" accessibilityLiveRegion="polite" style={problem === 'over' ? styles.messageError : styles.message}>
            {message}
          </Text>
        ) : null}
        <PrimaryButton testID="payout-continue" label={tr("Continue")} onPress={problem === null ? () => onContinue(recipients) : undefined} disabled={problem !== null} />
      </View>

      <ActionSheet
        testID="payout-more-sheet"
        visible={menu}
        onClose={() => setMenu(false)}
        actions={[
          ...(onManageBeneficiaries
            ? [{ key: 'manage', label: tr("Manage beneficiaries"), onPress: () => { setMenu(false); onManageBeneficiaries(); } }]
            : []),
          { key: 'card', label: tr("Request a {{currency}} card", { currency }), onPress: () => { setMenu(false); requestCard(); } },
        ]}
      />
      <ActionSheet
        testID="payout-row-sheet"
        visible={rowMenu !== null}
        onClose={() => setRowMenu(null)}
        actions={[
          { key: 'amount', label: tr("Change amount"), onPress: () => { setEditing(rowMenu); setRowMenu(null); } },
          { key: 'remove', label: tr("Remove"), onPress: () => { if (rowMenu) remove(rowMenu); setRowMenu(null); } },
        ]}
      />
      {editingRecipient ? (
        <AmountSheet
          currency={currency}
          last4={editingRecipient.last4}
          initialMinor={editingRecipient.amountMinor}
          maxMinor={left + editingRecipient.amountMinor}
          onSave={(m) => { setAmount(editingRecipient.key, m); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {adding ? (
        <NewRecipientSheet
          currency={currency}
          ownerName={ownerName}
          leftMinor={left}
          onClose={() => setAdding(false)}
          onAdd={(r) => {
            setRecipients((list) => [...list, { ...r, key: `new-${nextNew}`, id: `new-${nextNew}` }]);
            setNextNew((n) => n + 1);
            setAdding(false);
          }}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------ Change amount */

function AmountSheet({
  currency,
  last4,
  initialMinor,
  maxMinor,
  onSave,
  onClose,
}: {
  currency: string;
  last4: string;
  initialMinor: number;
  /** What this account may take: what is left plus its own current amount. */
  maxMinor: number;
  onSave: (amountMinor: number) => void;
  onClose: () => void;
}): ReactElement {
  const [text, setText] = useState(initialMinor > 0 ? formatHundredths(initialMinor) : '');
  const [error, setError] = useState<string | null>(null);
  const save = (): void => {
    const m = parseToHundredths(text);
    if (m === null) return setError(tr("Enter an amount, for example 250 or 250.50"));
    if (m > maxMinor) return setError(tr("At most {{maxMinor}} {{currency}} is left for this account.", { maxMinor: formatHundredths(maxMinor), currency }));
    onSave(m);
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} accessibilityLabel={tr("Close")} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View testID="payout-amount-sheet" style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.sheetTitle}>{tr("Amount for account ending {{last4}}", { last4 })}</Text>
          <OutlinedField label={tr("Amount ({{currency}})", { currency })} invalid={error !== null}>
            <FieldInput testID="payout-amount-input" accessibilityLabel={tr("Amount in {{currency}}", { currency })} value={text} onChangeText={(t) => { setText(t); setError(null); }} />
          </OutlinedField>
          {error ? <Text testID="payout-amount-error" style={styles.messageError}>{error}</Text> : null}
          <PrimaryButton testID="payout-amount-save" label={tr("Save")} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* --------------------------------------------------------- New recipient */

export function NewRecipientSheet({
  currency,
  ownerName,
  leftMinor,
  onAdd,
  onClose,
}: {
  currency: string;
  ownerName: string;
  leftMinor: number;
  onAdd: (r: Omit<Recipient, 'key' | 'id'>) => void;
  onClose: () => void;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const supported = (BANK_FORMS[currency] ?? []).length > 0;
  const [values, setValues] = useState<BankFormValues>({});
  const [errors, setErrors] = useState<Partial<Record<BankFieldKey, string>>>({});
  const [save, setSave] = useState(false);
  const [full, setFull] = useState(false);
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);

  const add = (): void => {
    const found = validateBankForm(currency, values);
    setErrors(found);
    const m = full ? leftMinor : parseToHundredths(amount);
    let amountProblem: string | null = null;
    if (leftMinor === 0) amountProblem = tr("Nothing is left to assign. Change another account’s amount first.");
    else if (m === null || m <= 0) amountProblem = tr("Enter an amount, for example 250 or 250.50");
    else if (m > leftMinor) amountProblem = tr("At most {{leftMinor}} {{currency}} is left to assign.", { leftMinor: formatHundredths(leftMinor), currency });
    setAmountError(amountProblem);
    if (Object.keys(found).length > 0 || amountProblem !== null || m === null) return;
    // Only the last 4 digits are kept on the device; the full number goes once to the
    // server, which tokenises it (API Data Dictionary, BENEFICIARIES).
    onAdd({
      name: ownerName,
      bank: (values.bankName ?? '').trim(),
      last4: (values.accountNumber ?? '').slice(-4),
      amountMinor: m,
      isNew: true,
      save,
    });
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        testID="payout-new-sheet"
        style={[styles.newScreen, { paddingTop: insets.top + space.xs }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <Text accessibilityRole="header" style={styles.title}>{tr("Send to a New Recipient")}</Text>
          <Pressable testID="payout-new-close" accessibilityRole="button" accessibilityLabel={tr("Close")} onPress={onClose} hitSlop={12} style={styles.headerSide}>
            <Icon name="close" color={color.text.primary} size={22} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {!supported ? (
            <Text testID="payout-new-unsupported" style={styles.text}>{tr("New {{currency}} accounts can’t be added here yet. Choose one of your saved accounts.", { currency })}</Text>
          ) : (
            <>
              <Text accessibilityRole="header" style={styles.section}>{tr("Account Details")}</Text>
              <BankAccountFields
                currency={currency}
                values={values}
                errors={errors}
                onChange={(key, value) => {
                  setValues((v) => ({ ...v, [key]: value }));
                  if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
                }}
              />
              <OutlinedField label={tr("Account Name")}>
                <View style={styles.readonly} accessible accessibilityLabel={tr("Account name. Confirmed by your bank")}>
                  <Text style={styles.readonlyText}>{tr("Confirmed by your bank")}</Text>
                </View>
              </OutlinedField>
              <Text style={styles.help}>{tr("The account must be in your own name ({{ownerName}}). Adding it needs your authenticator code.", { ownerName })}</Text>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{tr("Save to beneficiary")}</Text>
                <Switch testID="payout-new-save" accessibilityLabel={tr("Save to beneficiary")} value={save} onValueChange={setSave} />
              </View>

              <View style={styles.amountHead}>
                <Text accessibilityRole="header" style={[styles.section, styles.amountSection]}>{tr("Amount")}</Text>
                <Text testID="payout-new-left" style={styles.leftLabel}>{tr("Left to assign: {{leftMinor}} {{currency}}", { leftMinor: formatHundredths(leftMinor), currency })}</Text>
              </View>
              <OutlinedField label={tr("Enter Amount")} invalid={amountError !== null}>
                <FieldInput
                  testID="payout-new-amount"
                  accessibilityLabel={tr("Amount in {{currency}}", { currency })}
                  value={full ? formatHundredths(leftMinor) : amount}
                  onChangeText={(t) => { setAmount(t); setFull(false); setAmountError(null); }}
                />
              </OutlinedField>
              {amountError ? <Text testID="payout-new-amount-error" style={styles.messageError}>{amountError}</Text> : null}
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{tr("Send the full amount left")}</Text>
                <Switch testID="payout-new-full" accessibilityLabel={tr("Send the full amount left")} value={full} onValueChange={(v) => { setFull(v); setAmountError(null); }} />
              </View>
            </>
          )}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
          <PrimaryButton testID="payout-new-add" label={tr("Add")} onPress={supported ? add : undefined} disabled={!supported} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  newScreen: { flex: 1, backgroundColor: color.bg.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, paddingBottom: space.xs },
  headerSide: { width: 36, height: 36, justifyContent: 'center' },
  title: { ...typography.headline, ...brandWeight('700'), color: color.text.primary },
  body: { paddingHorizontal: space.md, paddingBottom: space.lg, gap: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.xs },
  totalLabel: { ...typography.body, fontSize: 15, color: color.text.secondary },
  totalValue: { ...typography.body, ...brandWeight('700'), fontSize: 17, color: color.brand.primary, fontVariant: ['tabular-nums'] },
  section: {
    ...typography.body,
    ...brandWeight('500'),
    fontSize: 15,
    color: color.text.primary,
    paddingTop: space.sm,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
  text: { ...typography.caption, fontSize: 12, lineHeight: 18, color: color.text.secondary },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  newLink: { alignSelf: 'flex-end', minHeight: 32, justifyContent: 'center' },
  link: { ...typography.caption, ...brandWeight('700'), fontSize: 13, color: color.success.text },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: space.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.sunken,
  },
  cardMain: { flex: 1, gap: 4 },
  cardName: { ...typography.body, ...brandWeight('700'), fontSize: 15, color: color.text.primary },
  cardBank: { ...typography.caption, fontSize: 12, color: color.text.secondary },
  cardAmount: { ...typography.body, ...brandWeight('700'), fontSize: 15, color: color.text.primary, fontVariant: ['tabular-nums'] },
  hold: { ...typography.caption, fontSize: 11, color: color.warning.text },
  kebab: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  subhead: { ...typography.caption, ...brandWeight('700'), fontSize: 12, color: color.text.secondary, marginTop: space.xs },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: space.sm, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: color.border.strong },
  empty: { alignItems: 'center', gap: 8, paddingVertical: space.lg },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg.sunken },
  emptyText: { ...typography.caption, fontSize: 12, color: color.text.disabled },
  footer: { paddingHorizontal: space.md, paddingTop: space.xs, gap: 8 },
  message: { ...typography.caption, fontSize: 12, color: color.text.secondary, textAlign: 'center' },
  messageError: { ...typography.caption, fontSize: 12, color: color.error.text },
  scrim: { flex: 1, backgroundColor: color.bg.overlay },
  sheet: { backgroundColor: color.bg.canvas, padding: space.md, gap: 12, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetTitle: { ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  readonly: { flex: 1, minHeight: 40, justifyContent: 'center' },
  readonlyText: { ...typography.body, fontSize: 16, color: color.text.disabled },
  help: { ...typography.caption, fontSize: 12, color: color.text.secondary },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  switchLabel: { ...typography.body, fontSize: 14, color: color.text.primary },
  amountHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  amountSection: { flex: 1 },
  leftLabel: { ...typography.caption, fontSize: 12, color: color.brand.primary, paddingBottom: 6 },
}));
