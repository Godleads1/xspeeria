/**
 * "Confirm it's you" for server builds (ADR-034): the current 6-digit authenticator code is
 * sent to the server, which checks it and allows one action. Wrong codes count towards the
 * server's lock (5 → 15 minutes); the server's message is shown as written.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { messageFor } from '../../api/client';
import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { tr } from "../../i18n";

export function ServerCodeSheet({
  visible,
  reason,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  reason: string;
  /** Runs the action with the code; a rejection keeps the sheet open with its message. */
  onSubmit: (code: string) => Promise<void>;
  onCancel: () => void;
}): ReactElement | null {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCode('');
    setError(null);
  }, [visible]);

  if (!visible) return null;

  const submit = async (): Promise<void> => {
    const typed = code;
    setCode(''); // each code works once
    setBusy(true);
    setError(null);
    try {
      await onSubmit(typed);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.scrim} accessibilityLabel={tr("Cancel")} onPress={onCancel} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View testID="server-code-sheet" style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.title}>{tr("Confirm it's you")}</Text>
          <Text style={styles.reason}>{reason}</Text>
          <Text style={styles.body}>{tr("Enter the 6-digit code from your authenticator app.")}</Text>
          <TextInput
            testID="server-code-input"
            value={code}
            onChangeText={(t) => {
              setCode(t.replace(/\D/g, '').slice(0, 6));
              setError(null);
            }}
            placeholder="123456"
            placeholderTextColor={color.text.disabled}
            accessibilityLabel={tr("6-digit code")}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            autoFocus
            maxLength={6}
            style={styles.input}
          />
          {error ? (
            <Text testID="server-code-error" accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <PrimaryButton
            testID="server-code-confirm"
            label={busy ? tr("Checking…") : tr("Confirm")}
            onPress={() => void submit()}
            disabled={code.length !== 6 || busy}
          />
          <Pressable testID="server-code-cancel" accessibilityRole="button" onPress={onCancel} style={styles.cancel}>
            <Text style={styles.cancelText}>{tr("Cancel")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themed(() => ({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: color.bg.canvas,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: space.md,
    gap: space.sm,
  },
  title: { ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  reason: { ...typography.body, fontSize: 15, color: color.text.primary },
  body: { ...typography.caption, fontSize: 13, color: color.text.secondary },
  input: {
    ...typography.body,
    fontSize: 22,
    letterSpacing: 4,
    color: color.text.primary,
    borderWidth: 1,
    borderColor: color.border.strong,
    borderRadius: 12,
    paddingHorizontal: space.sm,
    minHeight: 52,
  },
  error: { ...typography.caption, fontSize: 13, color: color.error.text },
  cancel: { alignSelf: 'center', paddingVertical: space.xs },
  cancelText: { ...typography.body, fontSize: 15, color: color.text.secondary },
}));
