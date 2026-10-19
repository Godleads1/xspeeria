/**
 * Escrow steps for one deal (ADR-037, server builds). No Figma frame exists yet; it reuses the
 * My Deals / Choose payout styles.
 *
 * Xspeeria never holds money. Each side pays its amount + 1% fee into the partner bank's escrow
 * in its own country, within 5 minutes. Only the bank's confirmation counts as paid — never a
 * tap in the app. When both have paid, the bank pays out at once (DEC-044). If the other side
 * does not pay, your payment comes back in full, fee included.
 *
 * On a developer's computer the bank is pretend (`simulated`): the "Simulate my transfer"
 * button stands in for your bank transfer and still goes through the bank's signed message.
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '../../api/client';
import type { LegState, ServerSettlement } from '../../api/escrowApi';
import { Icon } from '../../components/icons';
import { ErrorState, LoadingState, PrimaryButton, Screen, StatusChip } from '../../components/primitives';
import { brandWeight, color, space, typography, themed } from '../../theme';
import type { EscrowSource } from './serverEscrow';

const POLL_MS = 3_000;

function grouped(text: string): string {
  const [whole, frac = ''] = text.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac ? `.${frac}` : ''}`;
}

export function money(amount: string, currency: string): string {
  return `${grouped(amount)} ${currency}`;
}

/** "4:59" until the deadline, or null once it has passed. */
export function countdown(deadline: string | null, now: number): string | null {
  if (!deadline) return null;
  const ms = Date.parse(deadline) - now;
  if (Number.isNaN(ms) || ms <= 0) return null;
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

type Tone = 'success' | 'warning' | 'error' | 'neutral';

/** One plain-language headline and detail for where the deal stands, from my side. */
export function escrowStatus(s: ServerSettlement, now: number): { title: string; detail: string; tone: Tone; done: boolean } {
  const pay = money(s.you_pay.total, s.you_pay.currency);
  const get = money(s.you_receive.amount, s.you_receive.currency);
  const left = countdown(s.funding_deadline, now);
  const iPaid = (['FUNDED', 'RELEASE_SENT', 'PAID_OUT', 'RETURN_SENT', 'RETURNED'] as LegState[]).includes(s.you_pay.state);
  if (s.on_hold && !['COMPLETED', 'CANCELLED', 'CLOSED_UNWOUND'].includes(s.phase)) {
    return {
      title: 'Paused for a check',
      detail: 'Something did not match, so our team will check this deal. No money moves until it is resolved.',
      tone: 'warning',
      done: false,
    };
  }
  switch (s.phase) {
    case 'INITIALIZING':
      return { title: 'Opening escrow', detail: 'The bank is opening an escrow account for each side.', tone: 'neutral', done: false };
    case 'AWAITING_FUNDING':
      if (iPaid) {
        return {
          title: 'Your payment arrived',
          detail: left ? `Waiting for the other side to pay — ${left} left.` : 'Waiting for the other side to pay.',
          tone: 'success',
          done: false,
        };
      }
      return {
        title: `Pay ${pay} into escrow`,
        detail: left
          ? `${left} left. If the time runs out, the deal is cancelled; anything paid comes back in full.`
          : 'The time to pay has passed.',
        tone: 'warning',
        done: false,
      };
    case 'RELEASING':
      return { title: 'Both sides paid', detail: `The bank is paying ${get} into your account.`, tone: 'success', done: false };
    case 'COMPLETED':
      return { title: 'Done', detail: `${get} was paid into your account.`, tone: 'success', done: true };
    case 'UNWINDING':
      return iPaid
        ? { title: 'Deal not completed', detail: `The other side did not pay in time. Your ${pay} is being returned in full, fee included.`, tone: 'warning', done: false }
        : { title: 'Deal not completed', detail: 'The time to pay ran out. The deal is being closed.', tone: 'warning', done: false };
    case 'CLOSED_UNWOUND':
      return s.you_pay.state === 'RETURNED'
        ? { title: 'Cancelled — refunded', detail: `Your ${pay} was returned in full, fee included.`, tone: 'neutral', done: true }
        : { title: 'Cancelled', detail: 'You did not pay in time. The other side was refunded. Nothing was paid out.', tone: 'neutral', done: true };
    case 'CANCELLED':
      return s.closure_reason === 'PROVISION_FAILED'
        ? { title: 'Cancelled', detail: 'The bank could not open escrow for this deal. Nothing was paid.', tone: 'neutral', done: true }
        : { title: 'Cancelled', detail: 'Nobody paid within 5 minutes. Nothing was paid.', tone: 'neutral', done: true };
    default:
      return { title: 'Being checked', detail: 'Our team is looking at this deal.', tone: 'warning', done: false };
  }
}

/** The steps list: each marked done once the bank has confirmed it. */
export function escrowSteps(s: ServerSettlement): { label: string; done: boolean }[] {
  const opened = s.phase !== 'INITIALIZING' && s.you_pay.state !== 'PENDING' && s.you_pay.state !== 'PROVISION_FAILED';
  const paid = ['FUNDED', 'RELEASE_SENT', 'PAID_OUT'].includes(s.you_pay.state);
  const otherPaid = ['FUNDED', 'RELEASE_SENT', 'PAID_OUT'].includes(s.you_receive.state);
  return [
    { label: 'Escrow opened by the bank', done: opened },
    { label: 'You paid in', done: paid },
    { label: 'The other side paid in', done: otherPaid },
    { label: 'The bank paid you out', done: s.you_receive.state === 'PAID_OUT' },
  ];
}

export function EscrowScreen({
  matchId,
  source,
  onBack,
  now = Date.now,
  pollMs = POLL_MS,
}: {
  matchId: string;
  source: EscrowSource;
  onBack: () => void;
  now?: () => number;
  pollMs?: number;
}): ReactElement {
  const [s, setS] = useState<ServerSettlement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const done = useRef(false);

  const load = useCallback(() => {
    source.get(matchId).then(
      (next) => {
        setS(next);
        setLoadError(null);
      },
      (e: unknown) => setLoadError(messageFor(e)),
    );
  }, [matchId, source]);
  useEffect(load, [load]);
  useEffect(() => {
    // The bank's confirmations arrive on the server; check again until the deal is finished.
    const poll = setInterval(() => {
      if (!done.current) load();
    }, pollMs);
    const clock = setInterval(() => setTick((n) => n + 1), 1_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load, pollMs]);

  if (loadError && !s) {
    return (
      <Screen testID="escrow-screen">
        <Header onBack={onBack} />
        <ErrorState title={loadError} onRetry={load} />
      </Screen>
    );
  }
  if (!s) {
    return (
      <Screen testID="escrow-screen">
        <Header onBack={onBack} />
        <LoadingState label="Loading the escrow steps" />
      </Screen>
    );
  }

  const status = escrowStatus(s, now());
  done.current = status.done;
  const payIn = s.you_pay.pay_in;
  const canSimulate = s.simulated && payIn !== null && countdown(s.funding_deadline, now()) !== null;

  const simulate = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setS(await source.simulateTransfer(matchId));
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="escrow-screen">
      <Header onBack={onBack} />
      {s.simulated ? (
        <Text testID="escrow-simulated" style={styles.simulated}>
          Pretend bank on a developer&apos;s computer — no real money moves.
        </Text>
      ) : null}

      <View style={styles.card} testID="escrow-status">
        <View style={styles.rowTop}>
          <Text accessibilityRole="header" style={styles.strong} testID="escrow-title">
            {status.title}
          </Text>
          <StatusChip label={status.done ? 'Finished' : 'In progress'} tone={status.tone} />
        </View>
        <Text style={styles.line} testID="escrow-detail">
          {status.detail}
        </Text>
      </View>

      <View style={styles.card} testID="escrow-you-pay">
        <Text style={styles.label}>You pay into escrow</Text>
        <Line label="Amount" value={money(s.you_pay.amount, s.you_pay.currency)} />
        <Line label="Xspeeria fee (1%)" value={money(s.you_pay.fee, s.you_pay.currency)} />
        <Line label="Total to transfer" value={money(s.you_pay.total, s.you_pay.currency)} testID="escrow-total" strong />
        {payIn ? (
          <View testID="escrow-pay-in" style={styles.payIn}>
            <Text style={styles.label}>Transfer exactly the total to</Text>
            <Line label="Bank" value={payIn.bank_name} />
            <Line label="Account name" value={payIn.account_name} />
            <Line label="Account number" value={payIn.account_number} testID="escrow-account-number" />
            <Line label="Reference" value={payIn.reference} testID="escrow-reference" />
            <Text style={styles.small}>
              Use the reference so the bank can match your payment. Transfer from an account in your own name.
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card} testID="escrow-you-receive">
        <Text style={styles.label}>You receive</Text>
        <Text style={styles.strong}>{money(s.you_receive.amount, s.you_receive.currency)}</Text>
        <Text style={styles.small}>Paid by the bank into the payout account(s) you chose.</Text>
      </View>

      <View style={styles.card} testID="escrow-steps">
        {escrowSteps(s).map((step, i) => (
          <View key={step.label} style={styles.step} testID={`escrow-step-${i}`}>
            <View style={[styles.dot, step.done ? styles.dotDone : null]} />
            <Text style={[styles.line, step.done ? styles.stepDone : null]}>
              {step.label}
              {step.done ? ' ✓' : ''}
            </Text>
          </View>
        ))}
      </View>

      {error ? (
        <Text testID="escrow-error" accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {canSimulate ? (
        <PrimaryButton
          testID="escrow-simulate"
          label={busy ? 'Sending to the pretend bank…' : 'Simulate my transfer'}
          onPress={() => void simulate()}
          disabled={busy}
        />
      ) : null}
    </Screen>
  );
}

function Header({ onBack }: { onBack: () => void }): ReactElement {
  return (
    <View style={styles.header}>
      <Pressable testID="escrow-back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
        <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>
        Escrow
      </Text>
      <View style={styles.spacer} />
    </View>
  );
}

function Line({ label, value, testID, strong }: { label: string; value: string; testID?: string; strong?: boolean }): ReactElement {
  return (
    <View style={styles.lineRow}>
      <Text style={styles.line}>{label}</Text>
      <Text selectable testID={testID} style={strong ? styles.strong : styles.value}>
        {value}
      </Text>
    </View>
  );
}

const styles = themed(() => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 24 },
  title: { ...brandWeight('700'), fontSize: 20, color: color.text.primary },
  simulated: { ...typography.caption, fontSize: 12, color: color.text.secondary },
  card: {
    gap: 6,
    padding: space.sm,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border.subtle,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { ...typography.caption, ...brandWeight('700'), fontSize: 13, color: color.text.primary },
  strong: { ...typography.body, ...brandWeight('700'), color: color.text.primary, flexShrink: 1 },
  value: { ...typography.body, fontSize: 14, color: color.text.primary, flexShrink: 1, textAlign: 'right' },
  line: { ...typography.caption, fontSize: 13, color: color.text.secondary, flexShrink: 1 },
  small: { ...typography.caption, fontSize: 12, color: color.text.secondary },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  payIn: { gap: 6, marginTop: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border.subtle },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: color.border.strong },
  dotDone: { backgroundColor: color.brand.primary, borderColor: color.brand.primary },
  stepDone: { color: color.text.primary },
  error: { ...typography.caption, fontSize: 13, color: color.error.text },
}));
