import type { ReactElement } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';

import { ChangeContactScreen } from '../../src/features/profile/ChangeContactScreen';
import { requestStepUp } from '../../src/features/security/stepUp';
import { useThemeMode } from '../../src/theme';

/** Route params are untrusted: only `phone` or `email` open the flow. */
export default function ChangeContactRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  if (kind !== 'phone' && kind !== 'email') return <Redirect href="/profile/edit" />;
  return (
    <ChangeContactScreen
      kind={kind}
      onBack={() => router.back()}
      onDone={() => router.back()}
      stepUp={requestStepUp}
      random={Crypto.getRandomBytes}
    />
  );
}
