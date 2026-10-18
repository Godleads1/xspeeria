import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Redirect, useRouter } from 'expo-router';

import { formatHundredths } from '../../../src/features/market/money';
import { useBeneficiaries } from '../../../src/features/profile/beneficiaryStore';
import { useProfile } from '../../../src/features/profile/profileStore';
import { requestStepUp } from '../../../src/features/security/stepUp';
import { orderDraft, useOrderDraft } from '../../../src/features/trade/orderDraft';
import { PayoutDestinationScreen } from '../../../src/features/trade/PayoutDestinationScreen';
import { orderReceiveMinor, placeOrder, receiveCurrency } from '../../../src/features/trade/placeOrder';
import { useThemeMode } from '../../../src/theme';

/**
 * Payout Destination (ADR-022). Opens only for an order confirmed on Select Match (a deep
 * link with no order goes back to Market). Continue → one 2FA check for the whole order →
 * one trade per listing, each paying the chosen accounts.
 */
export default function PayoutRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const draft = useOrderDraft();
  const beneficiaries = useBeneficiaries();
  const profile = useProfile();
  if (!draft) return <Redirect href="/marketplace" />;

  const currency = receiveCurrency(draft);
  const total = orderReceiveMinor(draft);
  // Only the user's own, verified accounts in the currency received (Banking spec §3.3).
  const saved = beneficiaries.filter((b) => b.status === 'verified' && b.currency === currency && b.name === profile.fullName);

  return (
    <PayoutDestinationScreen
      totalMinor={total}
      currency={currency}
      ownerName={profile.fullName}
      savedAccounts={saved}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/marketplace'))}
      onManageBeneficiaries={() => router.push('/profile/beneficiaries')}
      onContinue={async (recipients) => {
        const cur = draft.parts[0].listing.currency;
        const amount = formatHundredths(draft.parts.reduce((s, p) => s + p.amountMinor, 0));
        const trades = draft.parts.length > 1 ? ` in ${draft.parts.length} trades` : '';
        const accounts = `${recipients.length} ${recipients.length === 1 ? 'account' : 'accounts'}`;
        const isNew = recipients.some((r) => r.isNew) ? ', including a new account' : '';
        // One 2FA check covers the order and where it is paid (ADR-008).
        if (!(await requestStepUp(`${draft.side === 'buy' ? 'Buy' : 'Sell'} ${amount} ${cur}${trades}, paid to ${accounts}${isNew}`))) return;
        const result = placeOrder({ draft, recipients, now: Date.now(), random: Crypto.getRandomBytes });
        orderDraft.clear();
        if (result.failed > 0) {
          Alert.alert(
            'Some trades were not created',
            `${result.failed} of ${draft.parts.length} ${draft.side === 'buy' ? 'offers were' : 'requests were'} taken by someone else. ${result.created.length > 0 ? 'The others went ahead.' : 'Choose again.'}`,
          );
        }
        if (result.created.length > 0) router.replace({ pathname: '/trade/[id]', params: { id: result.created[0] } });
        else router.replace('/marketplace');
      }}
    />
  );
}
