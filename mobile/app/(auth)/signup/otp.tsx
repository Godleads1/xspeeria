import type { ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';

import { SERVER_MODE } from '../../../src/api/config';
import { ServerCodeScreen } from '../../../src/features/auth/ServerScreens';
import { CodeScreen, IDENTITY_BODY } from '../../../src/features/auth/SignupScreens';
import { serverAuth } from '../../../src/features/auth/serverAuth';
import { signup, useSignup } from '../../../src/features/auth/signupStore';
import { useThemeMode } from '../../../src/theme';
import { tr } from "../../../src/i18n";

export default function SignupOtpRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const draft = useSignup();
  if (!draft.phone) return <Redirect href="/signup/start" />;

  if (SERVER_MODE) {
    // ADR-027: the code was sent by the server after phone, email and PIN; it checks it too.
    const { phone, email, pin } = draft;
    if (!email || !pin || !draft.pinConfirmed) return <Redirect href="/signup/start" />;
    return (
      <ServerCodeScreen
        phone={phone}
        verify={(code) => serverAuth.verifyPhone(phone, code)}
        resend={() => serverAuth.register({ phone, email, pin })}
        onVerified={() => {
          // The PIN is on the server now; the app keeps no copy.
          signup.update({ identityVerified: true, pin: null });
          router.replace('/signup/authenticator');
        }}
        onExpired={() => router.replace('/signup/details')}
        onBack={() => router.back()}
      />
    );
  }

  return (
    <CodeScreen
      testID="signup-otp"
      kind="phone"
      target={draft.phone}
      step={2}
      title={tr("Verify Your Identity")}
      body={tr(IDENTITY_BODY)}
      verifyLabel={tr("Verify OTP")}
      altLabel={tr("Verify Using Selfie")}
      onAlt={() => router.back()}
      onBack={() => router.back()}
      onVerified={() => {
        signup.update({ identityVerified: true });
        router.replace('/signup/details');
      }}
      random={Crypto.getRandomBytes}
    />
  );
}
