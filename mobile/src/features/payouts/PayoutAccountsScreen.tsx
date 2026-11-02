/**
 * Payout accounts (Profile › Manage Beneficiaries in server builds, ADR-036).
 *
 * Your own accounts that the partner bank pays into from escrow. Only the last 4 digits are
 * ever shown (the server never returns more). Removing one asks "Confirm it's you" (ADR-054).
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '../../api/client';
import type { ServerPayoutAccount } from '../../api/payoutsApi';
import { Icon } from '../../components/icons';
import { EmptyState, ErrorState, LoadingState, PrimaryButton, Screen, StatusChip } from '../../components/primitives';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { ServerConfirm } from '../security/ServerConfirm';
import type { ConfirmIdentity } from '../security/serverConfirm';
import { accountStatus, type PayoutSource } from './serverPayouts';
import { tr } from "../../i18n";

export function PayoutAccountsScreen({
  source,
  onBack,
  onAdd,
  refreshSignal = 0,
  confirmWith,
}: {
  /** Tests inject this. */
  confirmWith?: ConfirmIdentity;
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
        <Pressable testID="payout-accounts-back" accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{tr("Payout accounts")}</Text>
        <View style={styles.spacer} />
      </View>
      <Text style={styles.intro}>{tr("Your own accounts or other people’s, for example a school’s. When a deal completes, the partner bank pays from escrow into the account(s) you choose. Adding or removing an account needs you to confirm it’s you.")}</Text>
      {notice ? (
        <Text testID="payout-accounts-notice" accessibilityRole="alert" style={styles.notice}>
          {notice}
        </Text>
      ) : null}

      {error ? (
        <ErrorState title={error} onRetry={load} />
      ) : accounts === null ? (
        <LoadingState label={tr("Loading your payout accounts")} />
      ) : accounts.length === 0 ? (
        <EmptyState title={tr("No payout accounts yet.")} />
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
                  accessibilityLabel={tr("Remove {{bank_name}} account ending {{account_last4}}", { bank_name: a.bank_name, account_last4: a.account_last4 })}
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

      <PrimaryButton testID="payout-accounts-add" label={tr("Add payout account")} onPress={onAdd} />

      <ServerConfirm
        visible={removing !== null}
        action="beneficiary.remove"
        confirm={confirmWith}
        reason={removing ? tr("Remove {{bank_name}} •••• {{account_last4}}. Deals that already use it keep it.", { bank_name: removing.bank_name, account_last4: removing.account_last4 }) : ''}
        onCancel={() => setRemoving(null)}
        onSubmit={async (approval) => {
          if (!removing) return;
          await source.remove(removing.payout_account_id, approval);
          setRemoving(null);
          setNotice(tr("Account removed."));
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
