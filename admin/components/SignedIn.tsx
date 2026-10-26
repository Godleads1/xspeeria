'use client';

/** Wraps every signed-in page: loads who is signed in, then the shell with their menu. */

import { useRouter } from 'next/navigation';
import { useCallback, type ReactElement, type ReactNode } from 'react';

import { SessionProvider, useSession } from '../lib/session';
import { AppShell } from './shell/AppShell';

function Shell({ current, children }: { current: string; children: ReactNode }): ReactElement {
  const { me, logout } = useSession();
  return (
    <AppShell
      permissions={me.permissions}
      who={{ name: me.name, role: me.role }}
      current={current}
      onLogout={() => void logout()}
    >
      {children}
    </AppShell>
  );
}

export function SignedIn({ current, children }: { current: string; children: ReactNode }): ReactElement {
  const router = useRouter();
  const signedOut = useCallback(() => router.replace('/login'), [router]);
  return (
    <SessionProvider onSignedOut={signedOut}>
      <Shell current={current}>{children}</Shell>
    </SessionProvider>
  );
}
