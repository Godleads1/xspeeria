'use client';

/** Wraps every signed-in page: loads who is signed in, then the shell with their menu. */

import { useRouter } from 'next/navigation';
import { useCallback, type ReactElement, type ReactNode } from 'react';

import { useStaffPhoto } from '../lib/photos';
import { SessionProvider, useSession } from '../lib/session';
import { AppShell } from './shell/AppShell';

function Shell({ current, children }: { current: string; children: ReactNode }): ReactElement {
  const { me, api, version, logout } = useSession();
  const photo = useStaffPhoto(api, me.id, me.has_photo, version);
  return (
    <AppShell
      permissions={me.permissions}
      who={{ name: me.name, role: me.role, photo }}
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
