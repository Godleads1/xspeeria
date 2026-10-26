'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, type ReactElement } from 'react';

import { LoginScreen } from '../../components/screens/LoginScreen';

function Login(): ReactElement {
  const router = useRouter();
  const params = useSearchParams();
  const passwordChanged = params.get('done') === 'password';
  return <LoginScreen passwordChanged={passwordChanged} onSignedIn={() => router.replace('/')} />;
}

export default function LoginPage(): ReactElement {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
