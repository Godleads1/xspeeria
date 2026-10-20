/**
 * The "Confirm it's you" sheet for server builds (ADR-054). Tries Fingerprint/Face ID first
 * (trusted phone, turned on in Security); otherwise starts a face check — or an email code
 * before the identity check — and resolves the one-use approval the server gives for it.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as Linking from 'expo-linking';

import { authApi, type Check } from '../../api/authApi';
import { messageFor } from '../../api/client';
import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { serverAuth } from '../auth/serverAuth';
import { CheckFields } from './CheckFields';
import {
  accessToken,
  approveWithBiometrics,
  confirmHostRegistry,
  usePendingConfirm,
  type ConfirmRequest,
} from './serverConfirm';
import { tr } from '../../i18n';

type Stage = { kind: 'biometric' } | { kind: 'starting' } | { kind: 'check'; check: Check } | { kind: 'error'; message: string };

async function openLink(url: string): Promise<void> {
  await Linking.openURL(url);
}

export function ServerConfirmHost({ openUrl = openLink }: { openUrl?: (url: string) => Promise<void> }): ReactElement | null {
  const request = usePendingConfirm();
  useEffect(() => confirmHostRegistry.register(), []);
  if (!request) return null;
  return <ConfirmFlow key={request.id} request={request} openUrl={openUrl} />;
}

function ConfirmFlow({ request, openUrl }: { request: ConfirmRequest; openUrl: (url: string) => Promise<void> }): ReactElement | null {
  const [stage, setStage] = useState<Stage>({ kind: 'biometric' });
  const [round, setRound] = useState(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        if (round === 0) {
          setStage({ kind: 'biometric' });
          const approval = await approveWithBiometrics(request.action);
          if (!live) return;
          if (approval) {
            request.resolve(approval);
            return;
          }
        }
        setStage({ kind: 'starting' });
        const check = await authApi.stepUpCheck(accessToken(), request.action, serverAuth.apiOptions());
        if (live) setStage({ kind: 'check', check });
      } catch (e) {
        if (live) setStage({ kind: 'error', message: messageFor(e) });
      }
    })();
    return () => {
      live = false;
    };
  }, [request, round]);

  if (stage.kind === 'biometric') return null;
  const x = serverAuth.apiOptions();

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => request.resolve(null)}>
      <Pressable style={styles.scrim} accessibilityLabel={tr('Cancel')} onPress={() => request.resolve(null)} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView testID="confirm-sheet" style={styles.sheet} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={styles.title}>{tr("Confirm it's you")}</Text>
          <Text style={styles.reason}>{request.reason}</Text>
          {stage.kind === 'check' ? (
            <CheckFields
              check={stage.check}
              submitLabel={tr('Confirm')}
              onCodes={async (email) => {
                request.resolve((await authApi.stepUpCode(accessToken(), stage.check.check_id, email, x)).step_up_token);
              }}
              onFaceStart={async () => (await authApi.stepUpFaceStart(accessToken(), stage.check.check_id, x)).url}
              onFaceFinish={async () => {
                request.resolve((await authApi.stepUpFaceResult(accessToken(), stage.check.check_id, x)).step_up_token);
              }}
              openUrl={openUrl}
              onEnded={(message) => setStage({ kind: 'error', message })}
            />
          ) : stage.kind === 'error' ? (
            <View style={styles.box}>
              <Text testID="confirm-error" accessibilityRole="alert" style={styles.error}>{stage.message}</Text>
              <PrimaryButton testID="confirm-retry" label={tr('Try again')} onPress={() => setRound((r) => r + 1)} />
            </View>
          ) : (
            <Text style={styles.body}>{tr('One moment…')}</Text>
          )}
          <Pressable testID="confirm-cancel" accessibilityRole="button" onPress={() => request.resolve(null)} style={styles.cancel}>
            <Text style={styles.cancelText}>{tr('Cancel')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themed(() => ({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: color.bg.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: 560 },
  sheetBody: { padding: space.md, paddingBottom: space.lg, gap: space.sm },
  title: { ...typography.headline, ...brandWeight('700'), fontSize: 20, color: color.text.primary },
  reason: { ...typography.body, ...brandWeight('500'), fontSize: 15, color: color.brand.primary },
  body: { ...typography.body, fontSize: 14, color: color.text.secondary },
  box: { gap: space.sm },
  error: { ...typography.caption, color: color.error.text },
  cancel: { alignSelf: 'center', paddingVertical: space.xs },
  cancelText: { ...typography.body, ...brandWeight('700'), color: color.error.text },
}));
