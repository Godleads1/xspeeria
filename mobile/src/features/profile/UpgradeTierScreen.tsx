/**
 * Go up a tier (ADR-058). Server builds.
 *
 * - Tier 2: BVN (checked by Didit against the name and date of birth on your ID) and your home
 *   address. The BVN is sent once for the check and never stored.
 * - Tier 3: a proof of address from the last 3 months (photo of a utility bill or bank
 *   statement; checked by Didit, never stored) and where the money you trade comes from.
 *
 * The server decides everything and limits the paid checks to 3 tries a day.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { messageFor } from '../../api/client';
import type { AddressInput, TierChecksView } from '../../api/limitsApi';
import { Icon } from '../../components/icons';
import { ErrorState, LoadingState, PrimaryButton, Screen } from '../../components/primitives';
import { k, tr } from '../../i18n';
import { brandWeight, color, space, themed, typography } from '../../theme';

export const SOURCES: readonly { key: string; label: string }[] = [
  { key: 'salary', label: k('Salary') },
  { key: 'business', label: k('Business income') },
  { key: 'savings', label: k('Savings') },
  { key: 'investments', label: k('Investments') },
  { key: 'gift', label: k('Gift or family support') },
  { key: 'other', label: k('Other') },
];

export interface PickedDocument {
  readonly base64: string;
  readonly contentType: string;
}

export interface UpgradeSource {
  get(): Promise<TierChecksView>;
  bvn(bvn: string): Promise<TierChecksView>;
  address(a: AddressInput): Promise<TierChecksView>;
  proofOfAddress(doc: PickedDocument): Promise<TierChecksView>;
  sourceOfFunds(source: string, note?: string): Promise<TierChecksView>;
  /** Opens the photo library; null when cancelled. */
  pickDocument(): Promise<PickedDocument | null>;
}

const STATE: Record<string, string> = {
  approved: k('Verified'),
  declined: k('Not verified. Check the details and try again.'),
  in_review: k('Being checked. We’ll update this soon.'),
};

const ADDRESS_COUNTRY = {
  NG: k('Nigeria'),
  GB: k('United Kingdom'),
  US: k('United States'),
  CA: k('Canada'),
  DE: k('Germany'),
  FR: k('France'),
} as const;

export function UpgradeTierScreen({ source, onBack }: { source: UpgradeSource; onBack: () => void }): ReactElement {
  const [view, setView] = useState<TierChecksView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bvn, setBvn] = useState('');
  const [address, setAddress] = useState<AddressInput>({ line1: '', city: '', state: '', country: 'NG' });
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    setLoadError(null);
    source.get().then(setView, (e: unknown) => setLoadError(messageFor(e)));
  }, [source]);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<TierChecksView | null>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      if (next) setView(next);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  const bvnReady = /^[0-9]{11}$/.test(bvn);
  const addressReady = address.line1.trim().length >= 3 && address.city.trim().length >= 2 && address.state.trim().length >= 2;

  return (
    <Screen testID="upgrade-tier-screen">
      <View style={styles.header}>
        <Pressable testID="upgrade-back" accessibilityRole="button" accessibilityLabel={tr('Back')} onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{tr('Raise your limits')}</Text>
        <View style={styles.spacer} />
      </View>

      {loadError ? (
        <ErrorState title={loadError} onRetry={load} />
      ) : view === null ? (
        <LoadingState label={tr('Loading your checks')} />
      ) : (
        <>
          <Text testID="upgrade-tier" style={styles.big}>{tr('You are on Tier {{tier}}', { tier: view.tier })}</Text>

          <View style={styles.card} testID="upgrade-tier-2">
            <Text style={styles.strong}>{tr('Tier 2: BVN and home address')}</Text>
            <Text style={styles.line}>{tr('NGN {{daily}} a day · NGN {{monthly}} a month', { daily: '5,000,000', monthly: '20,000,000' })}</Text>

            <Text style={styles.label}>{tr('BVN')}</Text>
            {view.bvn === 'approved' ? (
              <Text testID="upgrade-bvn-done" style={styles.ok}>{tr(STATE.approved)}</Text>
            ) : (
              <>
                {view.bvn ? <Text testID="upgrade-bvn-state" style={styles.line}>{tr(STATE[view.bvn] ?? '')}</Text> : null}
                <TextInput
                  testID="upgrade-bvn"
                  accessibilityLabel={tr('BVN')}
                  value={bvn}
                  onChangeText={(t) => setBvn(t.replace(/\D/g, '').slice(0, 11))}
                  placeholder={tr('11 digits')}
                  placeholderTextColor={color.text.secondary}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={11}
                  secureTextEntry
                  style={styles.input}
                />
                <Text style={styles.small}>{tr('Checked against the name and date of birth on your ID. We never store your BVN.')}</Text>
                <PrimaryButton
                  testID="upgrade-bvn-submit"
                  label={tr('Check my BVN')}
                  disabled={busy || !bvnReady}
                  onPress={() =>
                    void run(async () => {
                      const typed = bvn;
                      setBvn('');
                      return source.bvn(typed);
                    })
                  }
                />
              </>
            )}

            <Text style={styles.label}>{tr('Home address')}</Text>
            {view.address ? (
              <Text testID="upgrade-address-done" style={styles.ok}>
                {[view.address.line1, view.address.city, view.address.state].filter(Boolean).join(', ')}
              </Text>
            ) : null}
            {view.proof_of_address === 'approved' ? null : (
              <>
                <Field testID="upgrade-line1" label={tr('Street address')} value={address.line1} onChange={(v) => setAddress({ ...address, line1: v })} />
                <Field testID="upgrade-city" label={tr('City')} value={address.city} onChange={(v) => setAddress({ ...address, city: v })} />
                <Field testID="upgrade-state" label={tr('State or region')} value={address.state} onChange={(v) => setAddress({ ...address, state: v })} />
                <Field testID="upgrade-postcode" label={tr('Postcode (if any)')} value={address.postcode ?? ''} onChange={(v) => setAddress({ ...address, postcode: v })} />
                <View style={styles.chips}>
                  {(['NG', 'GB', 'US', 'CA', 'DE', 'FR'] as const).map((c) => (
                    <Pressable
                      key={c}
                      testID={`upgrade-country-${c}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: address.country === c }}
                      onPress={() => setAddress({ ...address, country: c })}
                      style={[styles.chip, address.country === c ? styles.chipOn : null]}
                    >
                      <Text style={[styles.chipText, address.country === c ? styles.chipTextOn : null]}>
                        {tr(ADDRESS_COUNTRY[c])}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <PrimaryButton
                  testID="upgrade-address-submit"
                  label={view.address ? tr('Update my address') : tr('Save my address')}
                  disabled={busy || !addressReady}
                  onPress={() =>
                    void run(() =>
                      source.address({
                        ...address,
                        line1: address.line1.trim(),
                        city: address.city.trim(),
                        state: address.state.trim(),
                        ...(address.postcode?.trim() ? { postcode: address.postcode.trim() } : { postcode: undefined }),
                      }),
                    )
                  }
                />
              </>
            )}
          </View>

          <View style={[styles.card, view.tier < 2 ? styles.cardLocked : null]} testID="upgrade-tier-3">
            <Text style={styles.strong}>{tr('Tier 3: proof of address and source of funds')}</Text>
            <Text style={styles.line}>{tr('NGN {{daily}} a day · NGN {{monthly}} a month', { daily: '20,000,000', monthly: '100,000,000' })}</Text>
            {view.tier < 2 ? (
              <Text style={styles.small}>{tr('Finish Tier 2 first.')}</Text>
            ) : (
              <>
                <Text style={styles.label}>{tr('Proof of address')}</Text>
                {view.proof_of_address ? <Text testID="upgrade-poa-state" style={view.proof_of_address === 'approved' ? styles.ok : styles.line}>{tr(STATE[view.proof_of_address] ?? '')}</Text> : null}
                {view.proof_of_address === 'approved' ? null : (
                  <>
                    <Text style={styles.small}>{tr('A utility bill or bank statement from the last 3 months, showing your name and this address. We never store it.')}</Text>
                    <PrimaryButton
                      testID="upgrade-poa-submit"
                      label={tr('Choose a photo')}
                      disabled={busy}
                      onPress={() =>
                        void run(async () => {
                          const doc = await source.pickDocument();
                          return doc ? source.proofOfAddress(doc) : null;
                        })
                      }
                    />
                  </>
                )}

                <Text style={styles.label}>{tr('Where does the money you trade come from?')}</Text>
                {view.source_of_funds ? (
                  <Text testID="upgrade-sof-done" style={styles.ok}>{tr(SOURCES.find((s) => s.key === view.source_of_funds)?.label ?? 'Other')}</Text>
                ) : (
                  <>
                    <View style={styles.chips}>
                      {SOURCES.map((s) => (
                        <Pressable
                          key={s.key}
                          testID={`upgrade-sof-${s.key}`}
                          accessibilityRole="button"
                          disabled={busy}
                          onPress={() => void run(() => source.sourceOfFunds(s.key, note.trim() || undefined))}
                          style={styles.chip}
                        >
                          <Text style={styles.chipText}>{tr(s.label)}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Field testID="upgrade-sof-note" label={tr('Anything to add? (optional)')} value={note} onChange={(v) => setNote(v.slice(0, 200))} />
                  </>
                )}
              </>
            )}
          </View>

          {error ? (
            <Text testID="upgrade-error" accessibilityRole="alert" style={styles.error}>{error}</Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Field({ label, value, onChange, testID }: { label: string; value: string; onChange: (v: string) => void; testID: string }): ReactElement {
  return (
    <TextInput
      testID={testID}
      accessibilityLabel={label}
      placeholder={label}
      placeholderTextColor={color.text.secondary}
      value={value}
      onChangeText={(t) => onChange(t.slice(0, 120))}
      style={styles.input}
    />
  );
}

const styles = themed(() => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 24 },
  title: { ...brandWeight('700'), fontSize: 20, color: color.text.primary },
  big: { ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  card: { gap: 8, padding: space.sm, borderRadius: 14.37, borderWidth: 1, borderColor: color.border.subtle },
  cardLocked: { opacity: 0.6 },
  strong: { ...brandWeight('700'), fontSize: 15, color: color.text.primary },
  label: { ...typography.chipLabel, fontSize: 13, color: color.text.secondary, marginTop: 6 },
  line: { ...typography.caption, fontSize: 13, color: color.text.secondary },
  small: { ...typography.caption, fontSize: 12, color: color.text.secondary },
  ok: { ...typography.caption, fontSize: 13, color: color.success.text },
  input: { ...typography.body, minHeight: 44, borderWidth: 1, borderColor: color.border.subtle, borderRadius: 10, paddingHorizontal: 12, color: color.text.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: color.border.subtle, justifyContent: 'center' },
  chipOn: { borderColor: color.brand.primary, backgroundColor: color.brand.primary },
  chipText: { ...typography.caption, fontSize: 13, color: color.text.primary },
  chipTextOn: { ...brandWeight('700'), color: color.text.onFill },
  error: { ...typography.caption, color: color.error.text },
}));
