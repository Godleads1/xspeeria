import type { ReactElement } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { NewCaseScreen } from '../../../src/features/disputes/DisputeScreens';
import { serverDisputes } from '../../../src/features/disputes/serverDisputes';
import { useThemeMode } from '../../../src/theme';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * New dispute (with `tx`, from a deal's escrow screen) or support request (without).
 * The `tx` param is untrusted: anything that is not an id is ignored, and the server checks
 * that you are part of the deal.
 */
export default function NewCaseRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const { tx } = useLocalSearchParams<{ tx?: string }>();
  if (!SERVER_MODE) return <Redirect href="/marketplace" />;
  const transactionId = typeof tx === 'string' && UUID.test(tx) ? tx : null;
  return (
    <NewCaseScreen
      source={serverDisputes}
      transactionId={transactionId}
      onBack={() => router.back()}
      onCreated={(id) => router.replace({ pathname: '/market/case', params: { id } })}
    />
  );
}
