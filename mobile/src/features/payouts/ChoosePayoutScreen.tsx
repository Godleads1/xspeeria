/**
 * Choose where you are paid for one deal (ADR-036, server builds). Within 30 minutes of the
 * deal, each side picks one or more of their own bank-confirmed accounts in the currency they
 * receive, and how much each gets; the amounts must add up exactly (ADR-021 §3, ADR-035).
 * Your authenticator code confirms it. When both sides have chosen, the deal is ready for the
 * partner bank's escrow. Amounts are integer minor units throughout.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '../../api/client';
import type { ServerMatch } from '../../api/offersApi';
import type { ServerPayoutAccount } from '../../api/payoutsApi';
import { Icon } from '../../components/icons';
import { ErrorState, LoadingState, PrimaryButton, Screen } from '../../components/primitives';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { FieldInput, OutlinedField } from '../market/controls';
import { formatHundredths, parseToHundredths } from '../market/money';
import type { PayoutSource } from './serverPayouts';

function exactMinor(text: string): number | null {
  return /^[0-9]+(\.[0-9]{1,2})?$/.test(text) ? parseToHundredths(text) : text === '0' ? 0 : null;
}

/** "12 min left", "less than a minute left", or null when passed. */
export function timeLeft(deadline: string | null | undefined, now: number): string | null {
  if (!deadline) return null;
  const ms = Date.parse(deadline) - now;
  if (Number.isNaN(ms) || ms <= 0) return null;
  const mins = Math.floor(ms / 60_000);
  return mins < 1 ? 'less than a minute left' : `${mins} min left`;
}

export function ChoosePayoutScreen({
  matchId,
  source,
  onBack,
  onAddAccount,
  refreshSignal = 0,
  now = Date.now,
}: {
  matchId: string;
  source: PayoutSource;
  onBack: () => void;
  onAddAccount: (currency: string) => void;
  /** Changes when the screen comes back into view (after adding an account). */
  refreshSignal?: number;
  now?: () => number;
}): ReactElement {
  const [deal, setDeal] = useState<ServerMatch | null>(null);
  const [accounts, setAccounts] = useState<ServerPayoutAccount[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    Promise.all([source.match(matchId), source.list()]).then(
      ([m, list]) => {
        setDeal(m);
        const usable = list.filter((a) => a.currency === m.you_receive_currency && a.validation_state === 'validated');
        setAccounts(usable);
        // Default: the first account receives everything (ADR-021 §3).
        setAmounts((prev) =>
          Object.keys(prev).length > 0 || usable.length === 0 ? prev : { [usable[0].payout_account_id]: m.you_receive_amount ?? '' },
        );
      },
      (e: unknown) => setLoadError(messageFor(e)),
    );
  }, [matchId, source]);
  useEffect(load, [load, refreshSignal]);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const header = (
    <View style={styles.header}>
      <Pressable testID="choose-back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
        <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>
        Payout accounts
      </Text>
      <View style={styles.spacer} />
    </View>
  );

  if (loadError) return <Screen testID="choose-payout-screen">{header}<ErrorState title={loadError} onRetry={load} /></Screen>;
  if (!deal || !accounts) return <Screen testID="choose-payout-screen">{header}<LoadingState label="Loading" /></Screen>;

  const currency = deal.you_receive_currency ?? '';
  const due = exactMinor(deal.you_receive_amount ?? '') ?? 0;
  void tick; // re-render every 15 s so the time left stays current
  const left = timeLeft(deal.preparation_deadline, now());
  const lines = Object.entries(amounts).filter(([, v]) => v.trim() !== '');
  const parsed = lines.map(([id, v]) => [id, exactMinor(v.trim())] as const);
  const malformed = parsed.some(([, m]) => m === null || m === 0);
  const assigned = parsed.reduce((sum, [, m]) => sum + (m ?? 0), 0);
  const leftToAssign = due - assigned;
  const ready = !malformed && lines.length > 0 && leftToAssign === 0 && code.length === 6 && !busy;

  if (deal.preparation_state !== 'awaiting_payout_accounts' || saved) {
    const text =
      deal.preparation_state === 'funding_ready'
        ? 'Both sides have chosen their payout accounts. The deal is ready for the partner bank’s escrow — paying in is coming soon.'
        : deal.preparation_state === 'expired'
          ? 'The 30 minutes to choose payout accounts passed, so this deal was cancelled. Nothing was paid.'
          : 'You have chosen your payout accounts. Waiting for the other side.';
    return (
      <Screen testID="choose-payout-screen">
        {header}
        <Text testID="choose-status" style={styles.status}>{text}</Text>
        <PrimaryButton testID="choose-done" label="Done" onPress={onBack} />
      </Screen>
    );
  }

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const typed = code;
    setCode('');
    try {
      const m = await source.choose(
        matchId,
        parsed.map(([id, minor]) => ({ payout_account_id: id, amount: formatHundredths(minor ?? 0).replace(/,/g, '') })),
        typed,
      );
      setDeal(m);
      setSaved(true);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="choose-payout-screen">
      {header}
      <View testID="choose-summary" style={styles.card}>
        <Text style={styles.big}>{`You receive ${formatHundredths(due)} ${currency}`}</Text>
        <Text style={styles.line}>
          {left ? `Choose where it is paid — ${left}.` : 'Time is up for this deal.'}
        </Text>
        {deal.other_side_chose_payout_accounts ? <Text style={styles.line}>The other side has chosen.</Text> : null}
        {deal.you_chose_payout_accounts ? (
          <Text style={styles.line}>You have already chosen; you can change it until the other side chooses.</Text>
        ) : null}
      </View>

      {accounts.length === 0 ? (
        <Text testID="choose-no-accounts" style={styles.line}>
          {`You have no confirmed ${currency} payout account yet.`}
        </Text>
      ) : (
        <View testID="choose-accounts" style={styles.list}>
          {accounts.map((a) => (
            <View key={a.payout_account_id} style={styles.row}>
              <Text style={styles.strong}>{`${a.bank_name} •••• ${a.account_last4}`}</Text>
              <OutlinedField label={`Amount in ${currency}`}>
                <FieldInput
                  testID={`choose-amount-${a.payout_account_id}`}
                  accessibilityLabel={`Amount to ${a.bank_name} ending ${a.account_last4}`}
                  value={amounts[a.payout_account_id] ?? ''}
                  onChangeText={(t) => setAmounts((s) => ({ ...s, [a.payout_account_id]: t }))}
                  placeholder="0.00"
                />
              </OutlinedField>
            </View>
          ))}
        </View>
      )}
      <Pressable testID="choose-add-account" accessibilityRole="button" onPress={() => onAddAccount(currency)} hitSlop={8}>
        <Text style={styles.link}>{`Add a ${currency} payout account`}</Text>
      </Pressable>

      {accounts.length > 0 ? (
        <Text testID="choose-left" style={[styles.line, leftToAssign !== 0 || malformed ? styles.warn : null]}>
          {malformed
            ? 'Enter amounts like 1000.00.'
            : leftToAssign > 0
              ? `Left to assign: ${formatHundredths(leftToAssign)} ${currency}`
              : leftToAssign < 0
                ? `${formatHundredths(-leftToAssign)} ${currency} more than you receive`
                : 'All assigned.'}
        </Text>
      ) : null}

      <OutlinedField label="Authenticator code *">
        <FieldInput
          testID="choose-code"
          accessibilityLabel="6-digit code from your authenticator app"
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
        <Text testID="choose-error" accessibilityRole="alert" style={styles.warn}>
          {error}
        </Text>
      ) : null}
      <PrimaryButton testID="choose-confirm" label={busy ? 'Saving…' : 'Confirm payout accounts'} onPress={() => void submit()} disabled={!ready} />
    </Screen>
  );
}

const styles = themed(() => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 24 },
  title: { ...brandWeight('700'), fontSize: 20, color: color.text.primary },
  card: { gap: 6, padding: space.sm, borderRadius: 12, borderWidth: 1, borderColor: color.border.subtle },
  big: { ...brandWeight('700'), fontSize: 20, color: color.text.primary },
  line: { ...typography.caption, fontSize: 13, color: color.text.secondary },
  warn: { ...typography.caption, fontSize: 13, color: color.error.text },
  status: { ...typography.body, fontSize: 15, color: color.text.primary },
  list: { gap: space.sm },
  row: { gap: 6, paddingBottom: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border.subtle },
  strong: { ...typography.body, ...brandWeight('700'), color: color.text.primary },
  link: { ...typography.caption, fontSize: 13, color: color.brand.primary },
}));
