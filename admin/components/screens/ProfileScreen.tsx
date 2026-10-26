'use client';

/** My profile and changing my password (ADR-060). Other sessions end when it changes. */

import { useState, type ReactElement } from 'react';

import { messageFor, type AdminApi } from '../../lib/api';
import { roleLabel } from '../../lib/permissions';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { color } from '../../theme';
import { Button, Form, FormError, Notice, PageTitle, TextInput } from '../forms';
import { PhotoPicker } from '../Avatar';
import { Panel } from '../primitives';
import { useStaffPhoto } from '../../lib/photos';
import { when } from './common';
import { PASSWORD_HINT } from './SetPasswordScreen';

export function ProfileScreen(): ReactElement {
  const { me, api, version, refresh } = useSession();
  const photo = useStaffPhoto(api, me.id, me.has_photo, version);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoDone, setPhotoDone] = useState<string | null>(null);

  async function changePhoto(next: { base64: string } | null): Promise<void> {
    setPhotoError(null);
    setPhotoDone(null);
    try {
      if (next) await api.setPhoto(me.id, next.base64);
      else await api.removePhoto(me.id);
      await refresh();
      setPhotoDone(next ? tr('Photo saved.') : tr('Photo removed.'));
    } catch (e) {
      setPhotoError(messageFor(e));
    }
  }
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function save(): Promise<void> {
    setDone(null);
    if (!current || next.length < 12) {
      setError(tr('Enter your current password and a new one of at least 12 characters.'));
      return;
    }
    if (next !== again) {
      setError(tr('The two new passwords don’t match.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setAgain('');
      setDone(tr('Password changed. You were logged out everywhere else.'));
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle crumb={tr('My profile')}>{tr('My profile')}</PageTitle>
      <Panel>
        <PhotoPicker
          preview={photo}
          onPick={(p) => void changePhoto(p)}
          onRemove={() => void changePhoto(null)}
          testId="my-photo"
        />
        <FormError message={photoError} />
        <Notice message={photoDone} />
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 8 }}>
          <dt style={label}>{tr('Name')}</dt>
          <dd style={value}>{me.name}</dd>
          <dt style={label}>{tr('Email')}</dt>
          <dd style={value}>{me.email}</dd>
          <dt style={label}>{tr('Phone Number')}</dt>
          <dd style={value}>{me.phone ? <span dir="ltr">{me.phone}</span> : '—'}</dd>
          <dt style={label}>{tr('Role')}</dt>
          <dd style={value}>{roleLabel(me.role)}</dd>
          <dt style={label}>{tr('Last log-in')}</dt>
          <dd style={value}>{tr('{{time}} (Lagos time)', { time: when(me.last_login_at) })}</dd>
        </dl>
        <p style={{ margin: 0, fontSize: 13, color: color.text.secondary }}>
          {tr('Your name, email, phone and role are changed by staff who manage accounts. Your photo is yours to change.')}
        </p>
      </Panel>
      <Panel>
        <h2 style={{ margin: 0, fontSize: 18 }}>{tr('Change password')}</h2>
        <Form label={tr('Change password')} onSubmit={() => void save()}>
          <TextInput
            label={tr('Current password')}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={setCurrent}
            testId="pw-current"
          />
          <TextInput
            label={tr('New password')}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={setNext}
            hint={tr(PASSWORD_HINT)}
            testId="pw-new"
          />
          <TextInput
            label={tr('New password again')}
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={setAgain}
            testId="pw-again"
          />
          <FormError message={error} />
          <Notice message={done} />
          <Button type="submit" busy={busy} testId="pw-save">
            {tr('Change password')}
          </Button>
        </Form>
      </Panel>
    </>
  );
}

const label = { color: color.text.secondary, margin: 0 } as const;
const value = { margin: 0 } as const;
