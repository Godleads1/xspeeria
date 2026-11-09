/**
 * "Need help?" — for someone who can't log in, usually because the face check fails on a new
 * phone (ADR-103; owner 2026-11-09: approved procedure, "Need help", "Reply through the form").
 *
 * 1. No saved request: phone (with dialling code), email and a message. The server answers the
 *    same whether or not an account has that phone.
 * 2. After sending: this phone keeps the request's private key, shows our team's answers and
 *    lets the person reply. A closed request offers to start a new one.
 *
 * Nothing proves who writes here, so the screen asks for no PIN, code or ID, and says so.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '../../api/client';
import type { HelpThread } from '../../api/helpApi';
import { ErrorState, LoadingState, PrimaryButton, Screen } from '../../components/primitives';
import { tr } from '../../i18n';
import { color, space, themed, typography } from '../../theme';
import { PhoneCountrySheet, PhoneInput, fullPhone, type PhoneCountry } from '../auth/ui';
import { Box, Header, when } from '../disputes/DisputeScreens';
import { FieldInput, OutlinedField } from '../market/controls';
import { normalisePhone } from '../profile/verification';
import type { HelpKeyStore, SavedHelp } from './helpKey';

export interface HelpSource {
  open(phone: string, email: string, message: string): Promise<{ request_id: string; key: string }>;
  read(requestId: string, key: string): Promise<HelpThread>;
  reply(requestId: string, key: string, message: string): Promise<void>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function NeedHelpScreen({
  source,
  store,
  onBack,
}: {
  source: HelpSource;
  store: HelpKeyStore;
  onBack: () => void;
}): ReactElement {
  const [saved, setSaved] = useState<SavedHelp | null | undefined>(undefined);
  useEffect(() => {
    void store.read().then(setSaved);
  }, [store]);

  if (saved === undefined) {
    return (
      <Screen testID="help-screen">
        <Header title={tr('Need help?')} onBack={onBack} testID="help-back" />
        <LoadingState label={tr('Loading')} />
      </Screen>
    );
  }
  return saved ? (
    <Thread
      saved={saved}
      source={source}
      onBack={onBack}
      onNew={async () => {
        await store.clear();
        setSaved(null);
      }}
    />
  ) : (
    <Form
      source={source}
      onBack={onBack}
      onSent={async (v) => {
        await store.save(v);
        setSaved(v);
      }}
    />
  );
}

function Form({
  source,
  onBack,
  onSent,
}: {
  source: HelpSource;
  onBack: () => void;
  onSent: (v: SavedHelp) => Promise<void>;
}): ReactElement {
  const [country, setCountry] = useState<PhoneCountry>('NG');
  const [picker, setPicker] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (): Promise<void> => {
    const p = normalisePhone(fullPhone(country, phone));
    if (!p) return setError(tr('Enter a valid phone number'));
    if (!EMAIL.test(email.trim())) return setError(tr('Enter a valid email address'));
    if (!message.trim()) return setError(tr('Tell us what went wrong'));
    setBusy(true);
    setError(null);
    try {
      const made = await source.open(p, email.trim(), message.trim());
      await onSent({ requestId: made.request_id, key: made.key });
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="help-screen">
      <Header title={tr('Need help?')} onBack={onBack} testID="help-back" />
      <Text style={styles.intro}>
        {tr('Can’t log in? Tell us what happened and our team will reply here. Never send your PIN, codes or ID photos.')}
      </Text>
      <OutlinedField label={tr('Phone Number')} invalid={false}>
        <PhoneInput testID="help-phone" country={country} value={phone} onChange={(t) => { setPhone(t); setError(null); }} onPickCountry={() => setPicker(true)} />
      </OutlinedField>
      <PhoneCountrySheet testID="help-country" visible={picker} onClose={() => setPicker(false)} onPick={setCountry} />
      <OutlinedField label={tr('Email')} invalid={false}>
        <FieldInput
          testID="help-email"
          accessibilityLabel={tr('Email')}
          value={email}
          onChangeText={(t) => { setEmail(t); setError(null); }}
          keyboardType="email-address"
          inputMode="text"
          maxLength={254}
          placeholder="name@example.com"
        />
      </OutlinedField>
      <Box testID="help-message" label={tr('What went wrong?')} value={message} onChange={(v) => { setMessage(v); setError(null); }} lines={4} />
      {error ? (
        <Text testID="help-error" accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <PrimaryButton testID="help-send" label={busy ? tr('Sending…') : tr('Send')} onPress={() => void send()} disabled={busy} />
    </Screen>
  );
}

function Thread({
  saved,
  source,
  onBack,
  onNew,
}: {
  saved: SavedHelp;
  source: HelpSource;
  onBack: () => void;
  onNew: () => Promise<void>;
}): ReactElement {
  const [t, setT] = useState<HelpThread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    source
      .read(saved.requestId, saved.key)
      .then(setT)
      .catch((e: unknown) => setError(messageFor(e)));
  }, [saved, source]);
  useEffect(load, [load]);

  const send = async (): Promise<void> => {
    setBusy(true);
    setSendError(null);
    try {
      await source.reply(saved.requestId, saved.key, reply.trim());
      setReply('');
      load();
    } catch (e) {
      setSendError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <Screen testID="help-screen">
        <Header title={tr('Need help?')} onBack={onBack} testID="help-back" />
        <ErrorState title={error} onRetry={load} />
        <NewLink onNew={onNew} />
      </Screen>
    );
  }
  if (!t) {
    return (
      <Screen testID="help-screen">
        <Header title={tr('Need help?')} onBack={onBack} testID="help-back" />
        <LoadingState label={tr('Loading')} />
      </Screen>
    );
  }
  const open = t.status === 'open';
  return (
    <Screen testID="help-screen">
      <Header title={tr('Need help?')} onBack={onBack} testID="help-back" />
      <Text style={styles.intro}>
        {tr('Our team will reply here. Check back later, or tap Refresh. Never send your PIN, codes or ID photos.')}
      </Text>
      <View style={styles.list} testID="help-messages">
        {t.messages.map((m) => (
          <View key={m.message_id} style={[styles.bubble, m.author === 'you' ? styles.mine : styles.staff]}>
            <Text style={styles.small}>{m.author === 'you' ? tr('You') : tr('Xspeeria team')}</Text>
            <Text style={styles.line}>{m.body}</Text>
            <Text style={styles.small}>{when(m.created_at)}</Text>
          </View>
        ))}
      </View>
      <Pressable testID="help-refresh" accessibilityRole="button" onPress={load} hitSlop={8}>
        <Text style={styles.link}>{tr('Refresh')}</Text>
      </Pressable>
      {open ? (
        <>
          <Box testID="help-reply" label={tr('Write a message')} value={reply} onChange={(v) => { setReply(v); setSendError(null); }} lines={3} />
          {sendError ? (
            <Text testID="help-send-error" accessibilityRole="alert" style={styles.error}>
              {sendError}
            </Text>
          ) : null}
          <PrimaryButton testID="help-reply-send" label={busy ? tr('Sending…') : tr('Send')} onPress={() => void send()} disabled={busy || reply.trim().length === 0} />
        </>
      ) : (
        <>
          <Text testID="help-closed" style={styles.small}>
            {tr('This request is closed. Send a new one if you still need help.')}
          </Text>
          <NewLink onNew={onNew} />
        </>
      )}
    </Screen>
  );
}

function NewLink({ onNew }: { onNew: () => Promise<void> }): ReactElement {
  return (
    <Pressable testID="help-new" accessibilityRole="button" onPress={() => void onNew()} hitSlop={8}>
      <Text style={styles.link}>{tr('Start a new request')}</Text>
    </Pressable>
  );
}

const styles = themed(() => ({
  intro: { ...typography.body, fontSize: 14, color: color.text.secondary },
  list: { gap: space.xs },
  bubble: { gap: 2, padding: space.sm, borderRadius: 12, maxWidth: '90%' },
  mine: { alignSelf: 'flex-end', backgroundColor: color.bg.sunken },
  staff: { alignSelf: 'flex-start', borderWidth: 1, borderColor: color.border.subtle },
  line: { ...typography.body, fontSize: 15, color: color.text.secondary },
  small: { ...typography.caption, fontSize: 12, color: color.text.secondary },
  link: { ...typography.body, fontSize: 14, color: color.brand.primary },
  error: { ...typography.caption, color: color.error.text },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.border.subtle },
}));
