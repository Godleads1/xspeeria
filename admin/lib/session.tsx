'use client';

/**
 * Who is signed in to the console (ADR-060). Loads `/me`; a 401 means "not signed in" and
 * sends the person to the log-in page.
 *
 * `can()` only decides what to SHOW. The server checks the permission again on every call,
 * so a hidden button is never the control.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactElement, type ReactNode } from 'react';

import { AdminApiError, adminApi, messageFor, type AdminApi, type Me } from './api';
import { tr } from './i18n';

interface Session {
  me: Me;
  /** The API the signed-in pages use (tests pass a fake one to the provider). */
  api: AdminApi;
  can: (permission: string) => boolean;
  /** Changes each time `refresh` runs, so photos shown for me reload. */
  version: number;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}

export function SessionProvider({
  children,
  onSignedOut,
  api = adminApi,
}: {
  children: ReactNode;
  /** Called on 401 and after log-out (the page sends the person to `/login`). */
  onSignedOut: () => void;
  api?: AdminApi;
}): ReactElement {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setMe(await api.me());
      setVersion((v) => v + 1);
      setError(null);
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 401) onSignedOut();
      else setError(messageFor(e));
    }
  }, [api, onSignedOut]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      onSignedOut();
    }
  }, [api, onSignedOut]);

  if (error) {
    return (
      <div role="alert" style={{ padding: 24 }}>
        <p>{error}</p>
        <button type="button" onClick={() => void refresh()}>
          {tr('Try again')}
        </button>
      </div>
    );
  }
  if (!me) {
    return (
      <div role="status" style={{ padding: 24 }}>
        {tr('Loading…')}
      </div>
    );
  }
  const permissions = new Set(me.permissions);
  return (
    <SessionContext.Provider value={{ me, api, version, can: (p) => permissions.has(p), refresh, logout }}>
      {children}
    </SessionContext.Provider>
  );
}
