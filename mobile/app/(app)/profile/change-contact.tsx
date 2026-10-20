import type { ReactElement } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';

import { SERVER_MODE } from '../../../src/api/config';
import { showBanner } from '../../../src/components/Banner';
import { serverPhoneChange } from '../../../src/features/auth/serverPin';
import { ChangeContactScreen } from '../../../src/features/profile/ChangeContactScreen';
import { NotEditableHere, ServerChangePhoneScreen } from '../../../src/features/profile/ServerChangePhoneScreen';
import { requestStepUp } from '../../../src/features/security/stepUp';
import { useThemeMode } from '../../../src/theme';
import { tr } from "../../../src/i18n";

/** Route params are untrusted: only `phone` or `email` open the flow. */
export default function ChangeContactRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  if (kind !== 'phone' && kind !== 'email') return <Redirect href="/profile/edit" />;
  if (SERVER_MODE && kind === 'phone') {
    return (
      <ServerChangePhoneScreen
        source={serverPhoneChange}
        onBack={() => router.back()}
        onDone={() => {
          showBanner({ tone: 'success', title: tr("Phone number updated"), message: tr("Log in with your new number from now on.") });
          router.back();
        }}
      />
    );
  }
  if (SERVER_MODE) {
    return (
      <NotEditableHere
        title={tr("Change email address")}
        body={tr("For your security, your email address can only be changed by our Support team. Contact Support from your Profile and we will help you.")}
        onBack={() => router.back()}
      />
    );
  }
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
