/**
 * Verify your identity (server builds, ADR-040). Reuses the Figma "Verify Your Identity"
 * heading style; the ID photo and selfie are taken on Didit's own secure screens (ADR-039),
 * so the app never handles ID images.
 *
 * Flow: intro → "Verify my identity" → Didit opens → back in the app the screen checks the
 * server again (on return and every few seconds while a check is under way). The server alone
 * decides the result; nothing here marks anyone verified.
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '../../api/client';
import { COUNTRY_NAME, type KycCountry, type ServerKycCase } from '../../api/kycApi';
import { Icon } from '../../components/icons';
import { ErrorState, LoadingState, PrimaryButton, Screen, StatusChip } from '../../components/primitives';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { Heading } from '../auth/ui';
import { safeVerificationUrl, type KycSource } from './serverKyc';
import { tr, k } from "../../i18n";

const POLL_MS = 5_000;

export const INTRO =
  k("To trade on Xspeeria we need to confirm who you are. You will take a photo of a valid government ID (such as your passport, national ID card or driver’s licence) and a short selfie. This is done securely by our verification partner, Didit.");

type Tone = 'success' | 'warning' | 'error' | 'neutral';

/** Intro for a second country's check (ADR-042). */
export function introFor(country: KycCountry): string {
  return tr("To pay in this country’s currency we need to confirm who you are in {{country}}. You will take a photo of a valid ID issued by {{country}} (such as a passport, driving licence or residence card) and a short selfie. This is done securely by our verification partner, Didit.", { country: tr(COUNTRY_NAME[country]) });
}

/** Headline, chip and button for each server status. */
export function kycCopy(c: ServerKycCase): { title: string; chip: string; tone: Tone; action: string | null } {
  switch (c.status) {
    case 'approved':
      return { title: tr("Your identity is verified"), chip: 'Verified', tone: 'success', action: null };
    case 'under_review':
      return { title: tr("We are reviewing your check"), chip: tr("In review"), tone: 'warning', action: null };
    case 'pending_documents':
      return { title: tr("Finish verifying your identity"), chip: tr("Not finished"), tone: 'warning', action: tr("Continue verification") };
    case 'rejected':
      return { title: tr("We could not verify you"), chip: tr("Not verified"), tone: 'error', action: tr("Try again") };
    case 'expired':
      return { title: tr("Your check has expired"), chip: 'Expired', tone: 'neutral', action: tr("Verify again") };
    default:
      return { title: tr("Verify Your Identity"), chip: tr("Not verified"), tone: 'neutral', action: tr("Verify my identity") };
  }
}

export function IdentityCheckScreen({
  source,
  onBack,
  onVerified,
  pollMs = POLL_MS,
  country = 'NG',
}: {
  /** ADR-042: the country this check verifies; the ID must be issued there. */
  country?: KycCountry;
  source: KycSource;
  onBack: () => void;
  /** Shown as "Go to Market" once verified. */
  onVerified?: () => void;
  pollMs?: number;
}): ReactElement {
  const [c, setC] = useState<ServerKycCase | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watching = useRef(false);

  const load = useCallback(() => {
    source.current().then(
      (next) => {
        setC(next);
        setLoadError(null);
      },
      (e: unknown) => setLoadError(messageFor(e)),
    );
  }, [source]);
  useEffect(load, [load]);

  useEffect(() => {
    // Back from Didit: check the result again. While a check is under way, keep checking.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    const t = setInterval(() => {
      if (watching.current) load();
    }, pollMs);
    return () => {
      sub.remove();
      clearInterval(t);
    };
  }, [load, pollMs]);
  watching.current = c?.status === 'pending_documents' || c?.status === 'under_review';

  const start = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const next = await source.start();
      setC(next);
      const url = safeVerificationUrl(next.verification_url);
      if (next.status === 'pending_documents') {
        if (!url) throw new Error('no link');
        await source.open(url);
      }
    } catch (e) {
      setError(e instanceof Error && e.message === 'no link' ? tr("Something went wrong. Please try again.") : messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <View style={styles.header}>
      <Pressable testID="identity-back" accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={onBack} hitSlop={12}>
        <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
      </Pressable>
      <View style={styles.spacer} />
    </View>
  );

  if (!c) {
    return (
      <Screen testID="identity-screen">
        {header}
        {loadError ? <ErrorState title={loadError} onRetry={load} /> : <LoadingState label={tr("Checking your identity status")} />}
      </Screen>
    );
  }

  const copy = kycCopy(c);
  return (
    <Screen testID="identity-screen">
      {header}
      <Heading
        title={copy.title}
        body={c.status === 'not_started' ? (country === 'NG' ? tr(INTRO) : introFor(country)) : undefined}
      />
      <View testID="identity-status" style={styles.card}>
        <View style={styles.rowTop}>
          <Text style={styles.label}>{tr("Identity check")}</Text>
          <StatusChip label={copy.chip} tone={copy.tone} />
        </View>
        {c.message && c.status !== 'not_started' ? (
          <Text testID="identity-message" style={styles.line}>
            {c.message}
          </Text>
        ) : null}
        {c.status === 'approved' && c.legal_name ? (
          <Text testID="identity-name" style={styles.line}>{tr("Name on your ID: {{legal_name}}", { legal_name: c.legal_name })}</Text>
        ) : null}
      </View>

      {c.status === 'not_started' || copy.action ? (
        <View style={styles.card}>
          <Text style={styles.label}>{tr("What you need")}</Text>
          <Text style={styles.line}>{tr("• A valid government ID with your photo, issued by {{country}}", { country: tr(COUNTRY_NAME[country]) })}</Text>
          <Text style={styles.line}>{tr("• Good light and about 2 minutes")}</Text>
          <Text style={styles.line}>{tr("• You must be 18 or older")}</Text>
          <Text style={styles.small}>{tr("Didit checks your ID and selfie and screens against sanctions lists. Xspeeria keeps only the result, your name and date of birth — never photos of your ID.")}</Text>
        </View>
      ) : null}

      {error ? (
        <Text testID="identity-error" accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {copy.action ? (
        <PrimaryButton
          testID="identity-start"
          label={busy ? tr("Opening…") : copy.action}
          onPress={() => void start()}
          disabled={busy}
        />
      ) : null}
      {c.status === 'approved' && onVerified ? (
        <PrimaryButton testID="identity-done" label={tr("Go to Market")} onPress={onVerified} />
      ) : null}
    </Screen>
  );
}

const styles = themed(() => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 24 },
  card: {
    gap: 6,
    padding: space.sm,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border.subtle,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { ...typography.caption, ...brandWeight('700'), fontSize: 13, color: color.text.primary },
  line: { ...typography.caption, fontSize: 13, color: color.text.secondary },
  small: { ...typography.caption, fontSize: 12, color: color.text.secondary, marginTop: 4 },
  error: { ...typography.caption, fontSize: 13, color: color.error.text },
}));
