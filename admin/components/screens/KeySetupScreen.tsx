'use client';

/**
 * ADR-081: a Super Admin must use a hardware security key, but hasn't added one yet. This
 * session can do nothing else until a key is added; then the console opens.
 */

import type { ReactElement } from 'react';

import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { color } from '../../theme';
import { Button } from '../forms';
import { SecurityKeys } from '../SecurityKeys';
import { AuthLayout } from './AuthLayout';

export function KeySetupScreen(): ReactElement {
  const { api, refresh, logout } = useSession();
  return (
    <AuthLayout title={tr('Add your security key')}>
      <div data-testid="key-setup" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, color: color.text.secondary }}>
          {tr('Super Admins must sign in with a hardware security key. Add yours now to open the console.')}
        </p>
        <SecurityKeys api={api} onAdded={() => void refresh()} />
        <Button variant="secondary" onClick={() => void logout()} testId="key-setup-logout">
          {tr('Log out')}
        </Button>
      </div>
    </AuthLayout>
  );
}
