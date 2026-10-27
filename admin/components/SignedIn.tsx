'use client';

/** Wraps every signed-in page: loads who is signed in, then the shell with their menu. */

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, type ReactElement, type ReactNode } from 'react';

import { useStaffPhoto } from '../lib/photos';
import { SessionProvider, useSession } from '../lib/session';
import { AppShell } from './shell/AppShell';

function Shell({ current, children }: { current: string; children: ReactNode }): ReactElement {
  const { me, api, version, logout, refresh } = useSession();
  const photo = useStaffPhoto(api, me.id, me.has_photo, version);
  // A 401 from the bell means the session ended: refresh() finds that out and goes to log-in.
  const bell = useMemo(
    () => ({ load: api.staffWork, seen: api.staffWorkSeen, onSignedOut: () => void refresh() }),
    [api, refresh],
  );
  return (
    <AppShell
      permissions={me.permissions}
      who={{ name: me.name, role: me.role, photo }}
      current={current}
      onLogout={() => void logout()}
      bell={bell}
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
