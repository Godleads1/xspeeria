'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, type ReactElement } from 'react';

import { LoginScreen } from '../../components/screens/LoginScreen';

function Login(): ReactElement {
  const router = useRouter();
  const params = useSearchParams();
  const notice = params.get('done') === 'password' ? 'Your password is set. Log in with it now.' : null;
  return <LoginScreen notice={notice} onSignedIn={() => router.replace('/')} />;
}

export default function LoginPage(): ReactElement {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
