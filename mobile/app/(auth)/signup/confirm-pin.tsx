import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import { Redirect, useRouter } from 'expo-router';

import { ApiError, messageFor } from '../../../src/api/client';
import { SERVER_MODE } from '../../../src/api/config';
import { ConfirmPinScreen } from '../../../src/features/auth/SignupScreens';
import { serverAuth } from '../../../src/features/auth/serverAuth';
import { signup, useSignup } from '../../../src/features/auth/signupStore';
import { useThemeMode } from '../../../src/theme';
import { tr } from "../../../src/i18n";

export default function SignupConfirmPinRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const draft = useSignup();
  if (SERVER_MODE ? !draft.email || !draft.phone : !draft.emailVerified) return <Redirect href="/signup/start" />;
  if (!draft.pin) return <Redirect href="/signup/pin" />;

  // Server mode (ADR-027): with phone, email and PIN known, the server sends the SMS code.
  const registerOnServer = (): void => {
    const { phone, email } = signup.get();
    const pin = signup.get().pin;
    if (!phone || !email || !pin) return;
    serverAuth.register({ phone, email, pin }).then(
      () => router.replace('/signup/otp'),
      (e: unknown) => {
        Alert.alert(tr("Couldn’t continue"), messageFor(e));
        if (e instanceof ApiError && e.code === 'AUTH_400_EMAIL_TAKEN') router.replace('/signup/details');
        else router.replace('/signup/pin');
      },
    );
  };

  return (
    <ConfirmPinScreen
      onNext={() => (SERVER_MODE ? registerOnServer() : router.replace('/signup/biometrics'))}
      onRestart={() => router.replace('/signup/pin')}
    />
  );
}
