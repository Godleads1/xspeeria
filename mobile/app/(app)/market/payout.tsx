import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Redirect, useRouter } from 'expo-router';

import { formatAmount } from '../../../src/features/market/money';
import { useBeneficiaries } from '../../../src/features/profile/beneficiaryStore';
import { useProfile } from '../../../src/features/profile/profileStore';
import { requestStepUp } from '../../../src/features/security/stepUp';
import { orderDraft, useOrderDraft } from '../../../src/features/trade/orderDraft';
import { PayoutDestinationScreen } from '../../../src/features/trade/PayoutDestinationScreen';
import { orderReceiveMinor, placeOrder, receiveCurrency } from '../../../src/features/trade/placeOrder';
import { useThemeMode } from '../../../src/theme';
import { tr } from "../../../src/i18n";
import { DemoOnly } from '../../../src/features/auth/DemoOnly';

/**
 * Payout Destination (ADR-022). Opens only for an order confirmed on Select Match (a deep
 * link with no order goes back to Market). Continue → one 2FA check for the whole order →
 * one trade per listing, each paying the chosen accounts.
 */
function PayoutRoute(): ReactElement {
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
        const amount = formatAmount(draft.parts[0].listing.currency, draft.parts.reduce((s, p) => s + p.amountMinor, 0));
        const action = draft.side === 'buy' ? tr("Buy {{amount}} {{cur}}", { amount, cur }) : tr("Sell {{amount}} {{cur}}", { amount, cur });
        const trades = draft.parts.length > 1 ? tr(" in {{count}} trades", { count: draft.parts.length }) : '';
        const accounts = recipients.length === 1 ? tr("paid to 1 account") : tr("paid to {{count}} accounts", { count: recipients.length });
        const isNew = recipients.some((r) => r.isNew) ? tr(", including a new account") : '';
        // One 2FA check covers the order and where it is paid (ADR-008).
        if (!(await requestStepUp(tr("{{action}}{{trades}}, {{accounts}}{{isNew}}", { action, trades, accounts, isNew })))) return;
        const result = placeOrder({ draft, recipients, now: Date.now(), random: Crypto.getRandomBytes });
        orderDraft.clear();
        if (result.failed > 0) {
          Alert.alert(
            tr("Some trades were not created"),
            `${draft.side === 'buy' ? tr("{{failed}} of {{count}} offers were taken by someone else.", { failed: result.failed, count: draft.parts.length }) : tr("{{failed}} of {{count}} requests were taken by someone else.", { failed: result.failed, count: draft.parts.length })} ${result.created.length > 0 ? tr("The others went ahead.") : tr("Choose again.")}`,
          );
        }
        if (result.created.length > 0) router.replace({ pathname: '/trade/[id]', params: { id: result.created[0] } });
        else router.replace('/marketplace');
      }}
    />
  );
}

/** ADR-096: demo only; a release build goes to Home. */
export default function PayoutRouteGuarded(): ReactElement {
  return (
    <DemoOnly>
      <PayoutRoute />
    </DemoOnly>
  );
}
