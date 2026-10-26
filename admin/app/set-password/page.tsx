'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, type ReactElement } from 'react';

import { SetPasswordScreen } from '../../components/screens/SetPasswordScreen';

/** `?id=` comes from an invitation link; only a well-formed id is used (route params are untrusted). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function SetPassword(): ReactElement {
  const router = useRouter();
  const raw = useSearchParams().get('id');
  const inviteId = raw && UUID.test(raw) ? raw : null;
  return <SetPasswordScreen inviteId={inviteId} onDone={() => router.replace('/login?done=password')} />;
}

export default function SetPasswordPage(): ReactElement {
  return (
    <Suspense>
      <SetPassword />
    </Suspense>
  );
}
