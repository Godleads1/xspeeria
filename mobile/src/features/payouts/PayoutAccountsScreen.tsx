/**
 * Payout accounts (Profile › Manage Beneficiaries in server builds, ADR-036).
 *
 * Your own accounts that the partner bank pays into from escrow. Only the last 4 digits are
 * ever shown (the server never returns more). Removing one asks for your authenticator code.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '../../api/client';
import type { ServerPayoutAccount } from '../../api/payoutsApi';
import { Icon } from '../../components/icons';
import { EmptyState, ErrorState, LoadingState, PrimaryButton, Screen, StatusChip } from '../../components/primitives';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { ServerCodeSheet } from '../security/ServerCodeSheet';
import { accountStatus, type PayoutSource } from './serverPayouts';

export function PayoutAccountsScreen({
  source,
  onBack,
  onAdd,
  refreshSignal = 0,
}: {
  /** Changes when the screen comes back into view (after adding an account). */
  refreshSignal?: number;
  source: PayoutSource;
  onBack: () => void;
  onAdd: () => void;
}): ReactElement {
  const [accounts, setAccounts] = useState<ServerPayoutAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ServerPayoutAccount | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    source.list().then(setAccounts, (e: unknown) => setError(messageFor(e)));
  }, [source]);
  useEffect(load, [load, refreshSignal]);

  return (
    <Screen testID="payout-accounts-screen">
      <View style={styles.header}>
        <Pressable testID="payout-accounts-back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          Payout accounts
        </Text>
        <View style={styles.spacer} />
      </View>
      <Text style={styles.intro}>
        Your own accounts. When a deal completes, the partner bank pays you from escrow into the account(s) you
        choose. Adding or removing an account needs your authenticator code.
      </Text>
      {notice ? (
        <Text testID="payout-accounts-notice" accessibilityRole="alert" style={styles.notice}>
          {notice}
        </Text>
      ) : null}

      {error ? (
        <ErrorState title={error} onRetry={load} />
      ) : accounts === null ? (
        <LoadingState label="Loading your payout accounts" />
      ) : accounts.length === 0 ? (
        <EmptyState title="No payout accounts yet." />
      ) : (
        <View testID="payout-accounts-list" style={styles.list}>
          {accounts.map((a) => {
            const st = accountStatus(a);
            return (
              <View key={a.payout_account_id} testID={`payout-account-${a.payout_account_id}`} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.strong}>{`${a.bank_name} •••• ${a.account_last4}`}</Text>
                  <Text style={styles.line}>
                    {`${a.currency}${a.account_type ? ` · ${a.account_type}` : ''}${a.account_name ? ` · ${a.account_name}` : ''}`}
                  </Text>
                  <StatusChip label={st.label} tone={st.tone} />
                </View>
                <Pressable
                  testID={`payout-account-${a.payout_account_id}-remove`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${a.bank_name} account ending ${a.account_last4}`}
                  onPress={() => setRemoving(a)}
                  hitSlop={10}
                >
                  <Icon name="trash" color={color.error.text} size={22} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <PrimaryButton testID="payout-accounts-add" label="Add payout account" onPress={onAdd} />

      <ServerCodeSheet
        visible={removing !== null}
        reason={removing ? `Remove ${removing.bank_name} •••• ${removing.account_last4}. Deals that already use it keep it.` : ''}
        onCancel={() => setRemoving(null)}
        onSubmit={async (code) => {
          if (!removing) return;
          await source.remove(removing.payout_account_id, code);
          setRemoving(null);
          setNotice('Account removed.');
          load();
        }}
      />
    </Screen>
  );
}

const styles = themed(() => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 24 },
  title: { ...brandWeight('700'), fontSize: 20, color: color.text.primary },
  intro: { ...typography.caption, fontSize: 13, color: color.text.secondary },
  notice: { ...typography.caption, fontSize: 13, color: color.success.text },
  list: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border.subtle,
  },
  rowText: { flex: 1, gap: 4, alignItems: 'flex-start' },
  strong: { ...typography.body, ...brandWeight('700'), color: color.text.primary },
  line: { ...typography.caption, fontSize: 13, color: color.text.secondary },
}));
