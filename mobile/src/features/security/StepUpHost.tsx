/**
 * "Confirm it's you" sheet for step-up checks (ADR-008). Accepts a 6-digit authenticator
 * code or a recovery code. 5 wrong codes → 15-minute lock. If 2FA is not set up yet, the
 * action is refused and the user is offered the setup screen.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, typography } from '../../theme';
import { stepUpHostRegistry, usePendingStepUp } from './stepUp';
import { twoFactor, useTwoFactor } from './twoFactorStore';

function minutesLeft(until: number, now: number): number {
  return Math.max(1, Math.ceil((until - now) / 60_000));
}

export function StepUpHost({
  onSetUp,
  now = Date.now,
}: {
  /** Opens 2FA setup when the user has none. */
  onSetUp: () => void;
  now?: () => number;
}): ReactElement | null {
  const request = usePendingStepUp();
  const tf = useTwoFactor();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => stepUpHostRegistry.register(), []);
  useEffect(() => {
    setCode('');
    setMessage(null);
  }, [request]);

  if (!request) return null;
  const enrolled = tf.authenticatorSecret !== null;
  const locked = now() < tf.lockedUntil;

  const confirm = (): void => {
    const r = twoFactor.verify(code, now());
    if (r.ok) {
      request.resolve(true);
      return;
    }
    setCode('');
    if (r.reason === 'locked') setMessage(`Too many wrong codes. Try again in ${minutesLeft(r.lockedUntil, now())} minutes.`);
    else setMessage(`That code is not right. ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'try' : 'tries'} left.`);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => request.resolve(false)}>
      <Pressable style={styles.scrim} accessibilityLabel="Cancel" onPress={() => request.resolve(false)} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View testID="step-up-sheet" style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.title}>{"Confirm it's you"}</Text>
          <Text style={styles.reason}>{request.reason}</Text>

          {!enrolled ? (
            <>
              <Text testID="step-up-not-enrolled" style={styles.body}>
                Set up 2 FA authentication first. It protects changes like this and is required to trade.
              </Text>
              <PrimaryButton
                testID="step-up-setup"
                label="Set up 2 FA"
                onPress={() => {
                  request.resolve(false);
                  onSetUp();
                }}
              />
            </>
          ) : locked ? (
            <Text testID="step-up-locked" style={styles.error}>
              Too many wrong codes. Try again in {minutesLeft(tf.lockedUntil, now())} minutes.
            </Text>
          ) : (
            <>
              <Text style={styles.body}>Enter the 6-digit code from your authenticator app, or a recovery code.</Text>
              <TextInput
                testID="step-up-code"
                value={code}
                onChangeText={(t) => {
                  setCode(t.toUpperCase().replace(/[^0-9A-Z-]/g, ''));
                  setMessage(null);
                }}
                placeholder="123456"
                placeholderTextColor={color.text.disabled}
                accessibilityLabel="Authentication code"
                autoFocus
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={9}
                style={styles.input}
              />
              {message ? <Text testID="step-up-error" style={styles.error}>{message}</Text> : null}
              <PrimaryButton testID="step-up-confirm" label="Confirm" onPress={confirm} disabled={code.length < 6} />
            </>
          )}

          <Pressable testID="step-up-cancel" accessibilityRole="button" onPress={() => request.resolve(false)} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: color.bg.canvas,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: space.md,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  title: { ...typography.headline, ...brandWeight('700'), fontSize: 20, color: color.text.primary },
  reason: { ...typography.body, ...brandWeight('500'), fontSize: 15, color: color.brand.primary },
  body: { ...typography.body, fontSize: 14, color: color.text.secondary },
  input: {
    height: 56,
    borderWidth: 1,
    borderColor: color.border.strong,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 6,
    color: color.text.primary,
    ...brandWeight('700'),
  },
  error: { ...typography.caption, color: color.error.text },
  cancel: { alignSelf: 'center', paddingVertical: space.xs },
  cancelText: { ...typography.body, ...brandWeight('700'), color: color.error.text },
});
