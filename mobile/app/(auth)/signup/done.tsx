import type { ReactElement } from 'react';
import { Redirect } from 'expo-router';

import { session } from '../../../src/features/auth/session';
import { DoneScreen } from '../../../src/features/auth/SignupScreens';
import { signup, useSignup } from '../../../src/features/auth/signupStore';
import { profileStore } from '../../../src/features/profile/profileStore';
import { useThemeMode } from '../../../src/theme';

/** Finishing sign-up signs the user in; the root guard then shows Home. */
export default function SignupDoneRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const draft = useSignup();
  if (!draft.pin || !draft.phone || !draft.email || !draft.emailVerified) return <Redirect href="/signup/start" />;
  const { phone, email, pin } = draft;
  return (
    <DoneScreen
      onFinish={() => {
        profileStore.confirmPhone(phone);
        profileStore.confirmEmail(email);
        session.completeSignUp({ phone, email, pin });
        signup.clear();
      }}
    />
  );
}
