/**
 * Disputes and support (ADR-057; Support runs through Disputes, ADR-050).
 * - `DisputesScreen`: my cases, newest first, and "Get help" for a support case.
 * - `NewCaseScreen`: a dispute on a deal (reason + what happened) or a support case.
 * - `CaseScreen`: one case — status, my messages and staff replies, and a reply box.
 *
 * A dispute pauses that deal's escrow until staff decide; a support case pauses nothing.
 * You never see the other side's words. No Figma frame exists yet; Market row styles reused.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { DisputeReason, ServerDispute } from '../../api/disputesApi';
import { messageFor } from '../../api/client';
import { Icon } from '../../components/icons';
import { EmptyState, ErrorState, LoadingState, PrimaryButton, Screen, StatusChip, type StatusTone } from '../../components/primitives';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { dayMonthYear, k, tr } from '../../i18n';
import type { DisputeSource } from './serverDisputes';

const MAX = 2000;

/** The built-in categories, with the app's own translated wording (ADR-057). */
export const REASONS: readonly { key: DisputeReason; label: string }[] = [
  { key: 'funds_not_received', label: k('I paid but the money hasn’t arrived') },
  { key: 'wrong_amount', label: k('The amount is wrong') },
  { key: 'counterparty_unresponsive', label: k('The other side isn’t paying') },
  { key: 'other', label: k('Something else') },
];

/** Wording for a category: the app's translation for the built-in four, else the staff's name. */
export function reasonLabel(code: string, name?: string): string {
  const known = REASONS.find((r) => r.key === code);
  if (known) return tr(known.label);
  return name ?? tr('Something else');
}


const STATUS: Record<ServerDispute['status'], { label: string; tone: StatusTone }> = {
  open: { label: k('Open'), tone: 'warning' },
  under_review: { label: k('In review'), tone: 'warning' },
  resolved: { label: k('Resolved'), tone: 'success' },
};

export function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dayMonthYear(d.getDate(), d.getMonth(), d.getFullYear(), true)}, ${hh}:${mm}`;
}

export function caseTitle(d: ServerDispute): string {
  if (d.kind === 'support') return tr('Support request');
  return d.opened_by_you ? tr('Your dispute on a deal') : tr('The other side reported a problem');
}

export function Header({ title, onBack, testID }: { title: string; onBack: () => void; testID: string }): ReactElement {
  return (
    <View style={styles.header}>
      <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={tr('Back')} onPress={onBack} hitSlop={12}>
        <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <View style={styles.spacer} />
    </View>
  );
}

export function Box({ testID, label, value, onChange, lines = 5 }: { testID: string; label: string; value: string; onChange: (v: string) => void; lines?: number }): ReactElement {
  return (
    <View>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        placeholder={label}
        placeholderTextColor={color.text.disabled}
        value={value}
        onChangeText={(t) => onChange(t.slice(0, MAX))}
        multiline
        numberOfLines={lines}
        maxLength={MAX}
        style={[styles.box, { minHeight: 22 * lines }]}
        textAlignVertical="top"
      />
      <Text style={styles.count}>{`${value.length}/${MAX}`}</Text>
    </View>
  );
}

/* --------------------------------------------------------------------- list */

export function DisputesScreen({
  source,
  onBack,
  onOpen,
  onNew,
  refreshSignal = 0,
}: {
  source: DisputeSource;
  onBack: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  refreshSignal?: number;
}): ReactElement {
  const [cases, setCases] = useState<ServerDispute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    setCases(null);
    source
      .mine()
      .then(setCases)
      .catch((e: unknown) => setError(messageFor(e)));
  }, [source]);
  useEffect(load, [load, refreshSignal]);

  return (
    <Screen testID="disputes-screen">
      <Header title={tr('Disputes & support')} onBack={onBack} testID="disputes-back" />
      <Text style={styles.intro}>
        {tr('Report a problem with a deal from its escrow screen. For anything else, ask for help here. Our team replies in each case.')}
      </Text>
      <PrimaryButton testID="disputes-new" label={tr('Get help')} onPress={onNew} />
      {error ? (
        <ErrorState title={error} onRetry={load} />
      ) : cases === null ? (
        <LoadingState label={tr('Loading your cases')} />
      ) : cases.length === 0 ? (
        <EmptyState title={tr('You have no disputes or support requests.')} />
      ) : (
        <View style={styles.list}>
          {cases.map((d) => (
            <Pressable
              key={d.dispute_id}
              testID={`case-${d.dispute_id}`}
              accessibilityRole="button"
              onPress={() => onOpen(d.dispute_id)}
              style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
            >
              <View style={styles.rowTop}>
                <Text style={styles.strong}>{caseTitle(d)}</Text>
                <StatusChip label={tr(STATUS[d.status].label)} tone={STATUS[d.status].tone} />
              </View>
              <Text style={styles.line}>{reasonLabel(d.reason)}</Text>
              <Text style={styles.small}>{when(d.updated_at)}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

/* ---------------------------------------------------------------------- new */

export function NewCaseScreen({
  source,
  transactionId,
  onBack,
  onCreated,
}: {
  source: DisputeSource;
  /** The deal (from its escrow screen); null for a support request. */
  transactionId: string | null;
  onBack: () => void;
  onCreated: (id: string) => void;
}): ReactElement {
  const deal = transactionId !== null;
  const [reason, setReason] = useState<DisputeReason | null>(deal ? null : 'other');
  // ADR-063: staff manage the list; the built-in four are used until it loads (or if it can't).
  const [choices, setChoices] = useState<readonly { key: string; label: string }[]>(
    REASONS.map((r) => ({ key: r.key, label: tr(r.label) })),
  );
  useEffect(() => {
    let live = true;
    source
      .categories?.()
      .then((list) => {
        if (live && list.length > 0) setChoices(list.map((c) => ({ key: c.code, label: reasonLabel(c.code, c.name) })));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [source]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = reason !== null && text.trim().length > 0 && !busy;

  const send = async (): Promise<void> => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      const d = await source.open(transactionId, reason, text.trim());
      onCreated(d.dispute_id);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="new-case-screen">
      <Header title={deal ? tr('Report a problem') : tr('Get help')} onBack={onBack} testID="new-case-back" />
      <Text style={styles.intro}>
        {deal
          ? tr('Opening a dispute pauses this deal’s escrow: no money is released or returned until our team decides.')
          : tr('Tell us what you need help with. Never share your PIN or codes.')}
      </Text>
      {deal ? (
        <View style={styles.list} accessibilityRole="radiogroup">
          {choices.map((r) => (
            <Pressable
              key={r.key}
              testID={`reason-${r.key}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: reason === r.key }}
              onPress={() => setReason(r.key)}
              style={[styles.choice, reason === r.key ? styles.choiceOn : null]}
            >
              <Text style={[styles.line, reason === r.key ? styles.choiceText : null]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Box testID="new-case-text" label={tr('What happened?')} value={text} onChange={(v) => { setText(v); setError(null); }} />
      {error ? (
        <Text testID="new-case-error" accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <PrimaryButton testID="new-case-send" label={busy ? tr('Sending…') : deal ? tr('Open dispute') : tr('Send')} onPress={() => void send()} disabled={!ready} />
    </Screen>
  );
}

/* --------------------------------------------------------------------- case */

export function CaseScreen({ id, source, onBack }: { id: string; source: DisputeSource; onBack: () => void }): ReactElement {
  const [d, setD] = useState<ServerDispute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    source
      .get(id)
      .then(setD)
      .catch((e: unknown) => setError(messageFor(e)));
  }, [id, source]);
  useEffect(load, [load]);

  const send = async (): Promise<void> => {
    setBusy(true);
    setSendError(null);
    try {
      setD(await source.message(id, reply.trim()));
      setReply('');
    } catch (e) {
      setSendError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <Screen testID="case-screen">
        <Header title={tr('Case')} onBack={onBack} testID="case-back" />
        <ErrorState title={error} onRetry={load} />
      </Screen>
    );
  }
  if (!d) {
    return (
      <Screen testID="case-screen">
        <Header title={tr('Case')} onBack={onBack} testID="case-back" />
        <LoadingState label={tr('Loading the case')} />
      </Screen>
    );
  }
  const open = d.status !== 'resolved';
  return (
    <Screen testID="case-screen">
      <Header title={caseTitle(d)} onBack={onBack} testID="case-back" />
      <View style={styles.card} testID="case-summary">
        <View style={styles.rowTop}>
          <Text style={styles.strong}>{reasonLabel(d.reason)}</Text>
          <StatusChip label={tr(STATUS[d.status].label)} tone={STATUS[d.status].tone} />
        </View>
        {d.description ? <Text style={styles.line}>{d.description}</Text> : null}
        {d.kind === 'dispute' && open ? (
          <Text testID="case-paused" style={styles.small}>
            {tr('This deal’s escrow is paused until our team decides.')}
          </Text>
        ) : null}
        {!d.opened_by_you ? (
          <Text style={styles.small}>{tr('Tell us your side below. The other side can’t see what you write.')}</Text>
        ) : null}
      </View>
      <View style={styles.list} testID="case-messages">
        {d.messages.map((m) => (
          <View key={m.message_id} style={[styles.bubble, m.author === 'you' ? styles.mine : styles.staff]}>
            <Text style={styles.small}>{m.author === 'you' ? tr('You') : tr('Xspeeria team')}</Text>
            <Text style={styles.line}>{m.body}</Text>
            <Text style={styles.small}>{when(m.created_at)}</Text>
          </View>
        ))}
      </View>
      {open ? (
        <>
          <Box testID="case-reply" label={tr('Write a message')} value={reply} onChange={(v) => { setReply(v); setSendError(null); }} lines={3} />
          {sendError ? (
            <Text testID="case-error" accessibilityRole="alert" style={styles.error}>
              {sendError}
            </Text>
          ) : null}
          <PrimaryButton testID="case-send" label={busy ? tr('Sending…') : tr('Send')} onPress={() => void send()} disabled={busy || reply.trim().length === 0} />
        </>
      ) : (
        <Text testID="case-closed" style={styles.small}>
          {tr('This case is closed. Open a new one if you still need help.')}
        </Text>
      )}
    </Screen>
  );
}

const styles = themed(() => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 24 },
  title: { ...brandWeight('700'), fontSize: 20, color: color.text.primary, flexShrink: 1, textAlign: 'center' },
  intro: { ...typography.body, fontSize: 14, color: color.text.secondary },
  list: { gap: space.xs },
  row: { gap: 4, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border.subtle },
  pressed: { opacity: 0.7 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  strong: { ...brandWeight('700'), fontSize: 15, color: color.text.primary, flexShrink: 1 },
  line: { ...typography.body, fontSize: 15, color: color.text.secondary },
  small: { ...typography.caption, fontSize: 12, color: color.text.secondary },
  card: { gap: 6, padding: space.sm, borderRadius: 12, borderWidth: 1, borderColor: color.border.subtle },
  choice: { padding: space.sm, borderRadius: 12, borderWidth: 1, borderColor: color.border.subtle },
  choiceOn: { borderColor: color.brand.primary },
  choiceText: { color: color.brand.primary, ...brandWeight('700') },
  box: {
    borderWidth: 1,
    borderColor: color.border.strong,
    borderRadius: 8,
    padding: space.sm,
    fontSize: 15,
    color: color.text.primary,
  },
  count: { ...typography.caption, fontSize: 11, color: color.text.disabled, alignSelf: 'flex-end' },
  bubble: { gap: 2, padding: space.sm, borderRadius: 12, maxWidth: '90%' },
  mine: { alignSelf: 'flex-end', backgroundColor: color.bg.sunken },
  staff: { alignSelf: 'flex-start', borderWidth: 1, borderColor: color.border.subtle },
  error: { ...typography.caption, color: color.error.text },
}));
