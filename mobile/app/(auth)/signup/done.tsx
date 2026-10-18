import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import { Redirect, useRouter } from 'expo-router';

import { messageFor } from '../../../src/api/client';
import { SERVER_MODE } from '../../../src/api/config';
import { session } from '../../../src/features/auth/session';
import { serverAuth } from '../../../src/features/auth/serverAuth';
import { DoneScreen } from '../../../src/features/auth/SignupScreens';
import { signup, useSignup } from '../../../src/features/auth/signupStore';
import { profileStore } from '../../../src/features/profile/profileStore';
import { useThemeMode } from '../../../src/theme';

/** Finishing sign-up signs the user in; the root guard then shows Home. */
export default function SignupDoneRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const draft = useSignup();

  if (SERVER_MODE) {
    // ADR-027: the server already holds the account; the session starts now that the
    // recovery codes have been saved.
    if (!serverAuth.hasPending()) return <Redirect href="/signup/start" />;
    return (
      <DoneScreen
        onFinish={() => {
          serverAuth.finish(Date.now(), { newAccount: draft.phone !== null }).then(
            () => {
              const { phone, email } = session.get().account;
              profileStore.confirmPhone(phone);
              profileStore.confirmEmail(email);
              signup.clear();
            },
            (e: unknown) => {
              Alert.alert('Couldn’t sign you in', messageFor(e));
              router.replace('/login');
            },
          );
        }}
      />
    );
  }

  if (!draft.pin || !draft.pinConfirmed || !draft.phone || !draft.email || !draft.emailVerified) return <Redirect href="/signup/start" />;
  const { phone, email, pin, biometric } = draft;
  return (
    <DoneScreen
      onFinish={() => {
        // Clears any earlier user's data first (ADR-018), then fills the new profile.
        session.completeSignUp({ phone, email, pin }, { biometric });
        profileStore.confirmPhone(phone);
        profileStore.confirmEmail(email);
        signup.clear();
      }}
    />
  );
}
