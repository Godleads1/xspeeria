import { type ReactElement } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { EscrowScreen } from '../../../src/features/escrow/EscrowScreen';
import { serverEscrow } from '../../../src/features/escrow/serverEscrow';
import { useThemeMode } from '../../../src/theme';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Escrow steps for a deal (ADR-037). The match id param is untrusted; the server checks access. */
export default function EscrowRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const { match } = useLocalSearchParams<{ match?: string }>();
  if (!SERVER_MODE || typeof match !== 'string' || !UUID.test(match)) return <Redirect href="/market/deals" />;
  return (
    <EscrowScreen
      matchId={match}
      source={serverEscrow}
      onBack={() => router.back()}
      onReport={(tx) => router.push({ pathname: '/market/new-case', params: { tx } })}
    />
  );
}
