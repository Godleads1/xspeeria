/**
 * Change phone number against the real server (ADR-047): new number → "Confirm it's you" →
 * a code texted to the NEW number → changed. Email and date of birth are not changed here
 * (contract: email changes go through Support; the date of birth comes from the verified ID).
 */

import { useState, type ReactElement } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageFor } from '../../api/client';
import { Icon } from '../../components/icons';
import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { PhoneInput, fullPhone } from '../auth/ui';
import { FieldInput, OutlinedField } from '../market/controls';
import { ServerConfirm } from '../security/ServerConfirm';
import type { ConfirmIdentity } from '../security/serverConfirm';
import { normalisePhone } from './verification';
import { tr } from "../../i18n";

export interface PhoneChangeSource {
  /** Needs a one-use `contact.change` approval (ADR-054). */
  start(newPhone: string, approval: string): Promise<void>;
  confirm(newPhone: string, smsCode: string): Promise<void>;
}

export function ServerChangePhoneScreen({
  source,
  onBack,
  onDone,
  confirmWith,
}: {
  source: PhoneChangeSource;
  /** Tests inject this. */
  confirmWith?: ConfirmIdentity;
  onBack: () => void;
  onDone: () => void;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const [raw, setRaw] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = (): void => {
    const n = normalisePhone(fullPhone('NG', raw));
    if (!n) return setError(tr("Enter the full number with country code, e.g. +234 803 000 0000"));
    setError(null);
    setPhone(n);
    setAsking(true);
  };

  const confirm = async (): Promise<void> => {
    if (!phone || !/^\d{6}$/.test(code)) return setError(tr("Enter the 6-digit code from the SMS"));
    setBusy(true);
    setError(null);
    try {
      await source.confirm(phone, code);
      onDone();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setCode('');
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      testID="change-phone-screen"
      style={[styles.screen, { paddingTop: insets.top + space.xs }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable testID="change-phone-back" accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>{tr("Change phone number")}</Text>
        <View style={styles.spacer} />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {!sent ? (
          <>
            <Text style={styles.text}>{tr("We will text a 6-digit code to the new number to confirm it is yours.")}</Text>
            <OutlinedField label={tr("New phone number")} invalid={Boolean(error)}>
              <PhoneInput testID="change-phone-input" country="NG" value={raw} onChange={setRaw} />
            </OutlinedField>
          </>
        ) : (
          <>
            <Text testID="change-phone-sent" style={styles.text}>{tr("Enter the code we sent to {{value}}.", { value: phone ?? '' })}</Text>
            <OutlinedField label={tr("SMS code")} invalid={Boolean(error)}>
              <FieldInput
                testID="change-phone-code"
                accessibilityLabel={tr("SMS code")}
                value={code}
                onChangeText={(t) => {
                  setCode(t.replace(/\D/g, '').slice(0, 6));
                  setError(null);
                }}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={6}
              />
            </OutlinedField>
          </>
        )}
        {error ? (
          <Text testID="change-phone-error" accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
        {!sent ? (
          <PrimaryButton testID="change-phone-next" label={tr("Send code")} onPress={next} />
        ) : (
          <PrimaryButton testID="change-phone-confirm" label={busy ? tr("Saving…") : tr("Confirm")} onPress={() => void confirm()} disabled={busy} />
        )}
      </View>
      <ServerConfirm
        visible={asking}
        action="contact.change"
        confirm={confirmWith}
        reason={tr("Change your phone number to {{value}}.", { value: phone ?? '' })}
        onCancel={() => setAsking(false)}
        onError={setError}
        onSubmit={async (approval) => {
          if (!phone) return;
          await source.start(phone, approval);
          setAsking(false);
          setSent(true);
        }}
      />
    </KeyboardAvoidingView>
  );
}

/** Email and date of birth (server builds): explained, not editable here. */
export function NotEditableHere({ title, body, onBack }: { title: string; body: string; onBack: () => void }): ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <View testID="not-editable-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
      <View style={styles.header}>
        <Pressable testID="not-editable-back" accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.spacer} />
      </View>
      <View style={styles.body}>
        <Text style={styles.text}>{body}</Text>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 44 },
  title: { flex: 1, textAlign: 'center', ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  spacer: { width: 22 },
  body: { paddingHorizontal: space.md, paddingTop: space.md, gap: space.sm },
  text: { ...typography.body, color: color.text.primary },
  error: { ...typography.caption, color: color.error.text },
  footer: { paddingHorizontal: space.md },
}));
