/**
 * The second check after the PIN (ADR-054), shared by log-in, sign-up, Forgot PIN and the
 * "Confirm it's you" sheet:
 * - `email`: the 6-digit code sent to the account email;
 * - `sms_email`: a code by SMS and a code by email (a new phone before the identity check);
 * - `face`: a selfie in the provider's page, matched to the identity-check photo;
 * - `kyc`: a new identity check (ID document and selfie) that our team asked for (ADR-104);
 *   the same two steps as the face check.
 *
 * The server owns every rule (tries, expiry, locks); this shows its answers. Codes are never
 * stored or logged. The face page link is opened once and not kept.
 */

import { useState, type ReactElement, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import type { Check } from '../../api/authApi';
import { ApiError, messageFor } from '../../api/client';
import { PrimaryButton } from '../../components/primitives';
import { color, space, themed, typography } from '../../theme';
import { GhostButton } from '../auth/ui';
import { safeVerificationUrl } from '../kyc/serverKyc';
import { FieldInput, OutlinedField } from '../market/controls';
import { tr } from '../../i18n';

/** What the screen says about the check, by method. */
export function checkText(check: Check): string {
  if (check.method === 'kyc') {
    return tr('Our team asked for a new identity check. Have your ID document ready, then take a selfie.');
  }
  if (check.method === 'face') {
    return tr('Take a quick selfie. We match it to the photo from your identity check.');
  }
  if (check.method === 'sms_email') {
    return tr('We sent a code by SMS to the number ending {{phone}} and a code to {{email}}.', {
      phone: (check.phone_hint ?? '').replace(/\*/g, ''),
      email: check.email_hint ?? '',
    });
  }
  return tr('We sent a 6-digit code to {{email}}.', { email: check.email_hint ?? '' });
}

/** Errors after which this check cannot go on: start again. */
export function checkEnded(e: unknown): boolean {
  return (
    e instanceof ApiError &&
    (e.status === 410 || e.code === 'AUTH_401_FACE_CHECK_FAILED')
  );
}

function Code({ testID, label, value, onChange }: { testID: string; label: string; value: string; onChange: (v: string) => void }): ReactElement {
  return (
    <OutlinedField label={label} invalid={false}>
      <FieldInput
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={6}
      />
    </OutlinedField>
  );
}

export function CheckFields({
  check,
  submitLabel,
  onCodes,
  onFaceStart,
  onFaceFinish,
  openUrl,
  onEnded,
  ready = true,
  children,
}: {
  check: Check;
  submitLabel: string;
  /** Email code (and SMS code for `sms_email`). Rejects with the server's error. */
  onCodes: (email: string, sms: string | null) => Promise<void>;
  /** Opens the face check; resolves the page link, or null when no page is needed. */
  onFaceStart: () => Promise<string | null>;
  /** The face check result. */
  onFaceFinish: () => Promise<void>;
  openUrl: (url: string) => Promise<void>;
  /** The check expired or failed: the caller starts again. */
  onEnded: (message: string) => void;
  /** Other fields on the screen are filled in (e.g. the new PIN). */
  ready?: boolean;
  children?: ReactNode;
}): ReactElement {
  const [email, setEmail] = useState('');
  const [sms, setSms] = useState('');
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (checkEnded(e)) {
        onEnded(messageFor(e));
        return;
      }
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  const codes = (): Promise<void> =>
    run(async () => {
      const typed = { email, sms };
      setEmail(''); // each code works once
      setSms('');
      await onCodes(typed.email, check.method === 'sms_email' ? typed.sms : null);
    });

  const face = (): Promise<void> =>
    run(async () => {
      if (started) {
        await onFaceFinish();
        return;
      }
      const url = await onFaceStart();
      if (url === null) {
        await onFaceFinish(); // the local developer check: nothing to open
        return;
      }
      const safe = safeVerificationUrl(url);
      if (!safe) throw new ApiError('FACE_LINK_REFUSED', 0, tr('The face check is not available right now. Please try again later.'));
      setStarted(true);
      await openUrl(safe);
    });

  const codesReady = /^\d{6}$/.test(email) && (check.method !== 'sms_email' || /^\d{6}$/.test(sms));

  return (
    <View style={styles.box}>
      <Text testID="check-text" style={styles.text}>
        {checkText(check)}
      </Text>
      {check.method === 'sms_email' ? (
        <Code testID="check-sms" label={tr('SMS code *')} value={sms} onChange={(v) => { setSms(v); setError(null); }} />
      ) : null}
      {check.method !== 'face' && check.method !== 'kyc' ? (
        <Code testID="check-email" label={tr('Email code *')} value={email} onChange={(v) => { setEmail(v); setError(null); }} />
      ) : null}
      {children}
      {error ? (
        <Text testID="check-error" accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {check.method === 'face' || check.method === 'kyc' ? (
        <View style={styles.actions}>
          <PrimaryButton
            testID="check-face"
            label={
              check.method === 'kyc'
                ? started
                  ? tr('I’ve finished the identity check')
                  : tr('Start identity check')
                : started
                  ? tr('I’ve taken the selfie')
                  : tr('Start face check')
            }
            onPress={() => void face()}
            disabled={busy || !ready}
          />
          {started ? (
            <GhostButton
              testID="check-face-again"
              label={check.method === 'kyc' ? tr('Open the identity check again') : tr('Open the face check again')}
              onPress={() => {
                setStarted(false);
                setError(null);
              }}
            />
          ) : null}
        </View>
      ) : (
        <PrimaryButton testID="check-submit" label={submitLabel} onPress={() => void codes()} disabled={busy || !codesReady || !ready} />
      )}
    </View>
  );
}

const styles = themed(() => ({
  box: { gap: space.sm },
  actions: { gap: 12 },
  text: { ...typography.body, fontSize: 14, color: color.text.secondary },
  error: { ...typography.caption, color: color.error.text },
}));
