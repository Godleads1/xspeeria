/**
 * Choose which country to verify (server builds; ADR-071, built on ADR-042).
 *
 * A deal needs an identity check in the country you pay from, with an ID issued there
 * (ADR-042 rules 2–3). The main "Verify your identity" button used to start only the
 * Nigerian check; this screen lists Nigeria, the United Kingdom and the United States with
 * each one's status from the server, and opens that country's check. No Figma frame exists
 * for it, so it follows the app's list style.
 *
 * Display only: the server decides every status and refuses a deal without the right check.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Pressable, Text, View } from 'react-native';

import { messageFor } from '../../api/client';
import { COUNTRY_FLAG, KYC_COUNTRIES, type KycCountry, type KycStatus, type ServerRegions } from '../../api/kycApi';
import { RoundFlag } from '../../components/flags';
import { Icon } from '../../components/icons';
import { ErrorState, LoadingState, Screen, type StatusTone } from '../../components/primitives';
import { k, tr } from '../../i18n';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { StatusPill } from '../home/StatusPill';

/** The country's own name, as a list label (COUNTRY_NAME in kycApi reads "the United Kingdom"). */
export const COUNTRY_LABEL: Record<KycCountry, string> = {
  NG: 'Nigeria',
  GB: k('United Kingdom'),
  US: k('United States'),
  CA: k('Canada'),
};
const CURRENCY: Record<KycCountry, string> = { NG: 'NGN', GB: 'GBP', US: 'USD', CA: 'CAD' };

export const STATUS_WORD: Record<KycStatus, { label: string; tone: StatusTone }> = {
  approved: { label: k('Verified'), tone: 'success' },
  under_review: { label: k('In review'), tone: 'warning' },
  pending_documents: { label: k('Not finished'), tone: 'warning' },
  rejected: { label: k('Not approved'), tone: 'error' },
  expired: { label: k('Expired'), tone: 'neutral' },
  not_started: { label: k('Not verified'), tone: 'neutral' },
};

export interface RegionsSource {
  get: () => Promise<ServerRegions>;
}

export function ChooseCountryScreen({
  source,
  onBack,
  onChoose,
}: {
  source: RegionsSource;
  onBack: () => void;
  onChoose: (country: KycCountry) => void;
}): ReactElement {
  const [regions, setRegions] = useState<ServerRegions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    source.get().then(setRegions, (e: unknown) => setError(messageFor(e)));
  }, [source]);
  useEffect(load, [load]);

  const statusOf = (c: KycCountry): KycStatus =>
    regions?.regions.find((r) => r.country === c)?.status ?? 'not_started';

  return (
    <Screen testID="choose-country-screen">
      <View style={styles.header}>
        <Pressable testID="country-back" accessibilityRole="button" accessibilityLabel={tr('Back')} onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{tr('Verify your identity')}</Text>
        <View style={styles.spacer} />
      </View>
      <Text style={styles.lead}>{tr('Which country will you pay from?')}</Text>
      <Text style={styles.line}>
        {tr('You need an identity check in each country whose currency you pay with, using an ID issued by that country. Receiving money into your own account abroad needs no extra check.')}
      </Text>

      {error ? (
        <ErrorState title={error} onRetry={load} />
      ) : regions === null ? (
        <LoadingState label={tr('Loading your identity checks')} />
      ) : (
        <View style={styles.list}>
          {KYC_COUNTRIES.map((c) => {
            const s = STATUS_WORD[statusOf(c)];
            const done = statusOf(c) === 'approved';
            return (
              <Pressable
                key={c}
                testID={`country-${c}`}
                accessibilityRole="button"
                accessibilityLabel={tr('{{country}}, pay in {{currency}}: {{status}}', { country: tr(COUNTRY_LABEL[c]), currency: CURRENCY[c], status: tr(s.label) })}
                onPress={() => onChoose(c)}
                style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
              >
                <RoundFlag code={COUNTRY_FLAG[c]} size={32} />
                <View style={styles.rowText}>
                  <Text style={styles.name}>{tr(COUNTRY_LABEL[c])}</Text>
                  <Text style={styles.line}>
                    {done ? tr('You can pay in {{currency}}', { currency: CURRENCY[c] }) : tr('Needed to pay in {{currency}}', { currency: CURRENCY[c] })}
                  </Text>
                </View>
                <StatusPill label={tr(s.label)} tone={s.tone} />
                <Icon name="chevron" color={color.text.secondary} size={18} />
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = themed(() => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 24 },
  title: { ...brandWeight('700'), fontSize: 20, color: color.text.primary },
  lead: { ...brandWeight('700'), fontSize: 17, color: color.text.primary, marginTop: space.sm },
  line: { ...typography.caption, fontSize: 13, color: color.text.secondary },
  list: { gap: space.sm, marginTop: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: 14.37,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  pressed: { opacity: 0.7 },
  rowText: { flex: 1, gap: 2 },
  name: { ...brandWeight('700'), fontSize: 15, color: color.text.primary },
}));
