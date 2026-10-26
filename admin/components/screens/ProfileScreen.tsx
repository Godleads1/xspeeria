'use client';

/** My profile and changing my password (ADR-060). Other sessions end when it changes. */

import { useState, type ReactElement } from 'react';

import { messageFor, type AdminApi } from '../../lib/api';
import { roleLabel } from '../../lib/permissions';
import { useSession } from '../../lib/session';
import { color } from '../../theme';
import { Button, Form, FormError, Notice, PageTitle, TextInput } from '../forms';
import { Panel } from '../primitives';
import { when } from './common';
import { PASSWORD_HINT } from './SetPasswordScreen';

export function ProfileScreen(): ReactElement {
  const { me, api } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function save(): Promise<void> {
    setDone(null);
    if (!current || next.length < 12) {
      setError('Enter your current password and a new one of at least 12 characters.');
      return;
    }
    if (next !== again) {
      setError('The two new passwords don’t match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setAgain('');
      setDone('Password changed. You were logged out everywhere else.');
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle>My profile</PageTitle>
      <Panel>
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 8 }}>
          <dt style={label}>Name</dt>
          <dd style={value}>{me.name}</dd>
          <dt style={label}>Email</dt>
          <dd style={value}>{me.email}</dd>
          <dt style={label}>Role</dt>
          <dd style={value}>{roleLabel(me.role)}</dd>
          <dt style={label}>Last log-in</dt>
          <dd style={value}>{when(me.last_login_at)} (Lagos time)</dd>
        </dl>
        <p style={{ margin: 0, fontSize: 13, color: color.text.secondary }}>
          Your name, email and role are changed by staff who manage accounts.
        </p>
      </Panel>
      <Panel>
        <h2 style={{ margin: 0, fontSize: 18 }}>Change password</h2>
        <Form label="Change password" onSubmit={() => void save()}>
          <TextInput
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={setCurrent}
            testId="pw-current"
          />
          <TextInput
            label="New password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={setNext}
            hint={PASSWORD_HINT}
            testId="pw-new"
          />
          <TextInput
            label="New password again"
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={setAgain}
            testId="pw-again"
          />
          <FormError message={error} />
          <Notice message={done} />
          <Button type="submit" busy={busy} testId="pw-save">
            Change password
          </Button>
        </Form>
      </Panel>
    </>
  );
}

const label = { color: color.text.secondary, margin: 0 } as const;
const value = { margin: 0 } as const;
