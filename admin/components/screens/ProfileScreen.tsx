'use client';

/**
 * My profile, after the Figma "User Profile" frames: a banner, a card with my photo, name and
 * role, and two tabs.
 *
 * - Profile: I may change my own name and phone (owner decision 2026-10-26). Email (my log-in),
 *   role and staff ID are shown but changed only by staff who manage accounts; the server
 *   refuses anything else.
 * - Password: change my password (my other sessions end). Two-factor authentication is shown
 *   switched on and can't be switched off: every staff log-in needs the email code (ADR-060).
 */

import { useState, type CSSProperties, type ReactElement } from 'react';

import { messageFor } from '../../lib/api';
import { tr } from '../../lib/i18n';
import { roleLabel } from '../../lib/permissions';
import { useStaffPhoto } from '../../lib/photos';
import { useSession } from '../../lib/session';
import { admin, color } from '../../theme';
import { PhotoPicker } from '../Avatar';
import { Button, Form, FormError, Notice, TextInput } from '../forms';
import { Flag } from '../LanguagePicker';
import { SecurityKeys } from '../SecurityKeys';
import { PASSWORD_HINT } from './SetPasswordScreen';

type Tab = 'profile' | 'password';

/** "Ada Grace Obi" → ["Ada", "Grace Obi"]: the console keeps one name, shown as two boxes. */
export function splitName(name: string): [string, string] {
  const clean = name.trim().replace(/\s+/g, ' ');
  const at = clean.indexOf(' ');
  return at < 0 ? [clean, ''] : [clean.slice(0, at), clean.slice(at + 1)];
}

export function ProfileScreen(): ReactElement {
  const { me } = useSession();
  const [tab, setTab] = useState<Tab>('profile');
  return (
    <>
      <h1 style={{ margin: '4px 0 8px', fontSize: 24, fontWeight: 600 }}>{tr('User Profile')}</h1>
      <div style={{ position: 'relative', backgroundColor: color.bg.sunken, border: `1px solid ${color.border.subtle}`, minHeight: 480 }}>
        <div
          aria-hidden="true"
          style={{
            height: 120,
            backgroundColor: admin.banner,
            backgroundImage: 'url(/profile-banner.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            gap: 32,
            padding: '0 24px 32px',
            marginTop: -66,
          }}
        >
          <ProfileCard />
          <section style={{ ...card, flex: '1 1 440px', padding: '16px 24px 24px' }}>
            <div role="tablist" aria-label={tr('User Profile')} style={{ display: 'flex', gap: 16, borderBottom: `1px solid ${color.border.subtle}` }}>
              <TabButton id="profile" current={tab} onSelect={setTab}>
                {tr('Profile')}
              </TabButton>
              <TabButton id="password" current={tab} onSelect={setTab}>
                {tr('Password')}
              </TabButton>
            </div>
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} style={{ paddingTop: 24 }}>
              {tab === 'profile' ? <ProfileTab key={me.id + me.name + (me.phone ?? '')} /> : <PasswordTab />}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function TabButton({
  id,
  current,
  onSelect,
  children,
}: {
  id: Tab;
  current: Tab;
  onSelect: (t: Tab) => void;
  children: string;
}): ReactElement {
  const on = id === current;
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      data-testid={`tab-${id}`}
      aria-selected={on}
      aria-controls={`panel-${id}`}
      onClick={() => onSelect(id)}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: `2px solid ${on ? color.brand.primary : 'transparent'}`,
        marginBottom: -1,
        padding: '6px 0 8px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 16,
        color: on ? color.brand.primary : color.text.secondary,
      }}
    >
      {children}
    </button>
  );
}

function ProfileCard(): ReactElement {
  const { me, api, version, refresh } = useSession();
  const photo = useStaffPhoto(api, me.id, me.has_photo, version);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function changePhoto(next: { base64: string } | null): Promise<void> {
    setError(null);
    setDone(null);
    try {
      if (next) await api.setPhoto(me.id, next.base64);
      else await api.removePhoto(me.id);
      await refresh();
      setDone(next ? tr('Photo saved.') : tr('Photo removed.'));
    } catch (e) {
      setError(messageFor(e));
    }
  }

  return (
    <section
      aria-label={tr('My photo')}
      style={{ ...card, flex: '0 0 210px', padding: '28px 16px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}
    >
      <PhotoPicker preview={photo} onPick={(p) => void changePhoto(p)} onRemove={() => void changePhoto(null)} testId="my-photo" />
      <FormError message={error} />
      <Notice message={done} />
      <p style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{me.name}</p>
      <span style={{ padding: '6px 10px', borderRadius: 4, backgroundColor: color.bg.sunken, fontSize: 13 }}>{roleLabel(me.role)}</span>
    </section>
  );
}

function ProfileTab(): ReactElement {
  const { me, api, refresh } = useSession();
  const [first0, last0] = splitName(me.name);
  const [first, setFirst] = useState(first0);
  const [last, setLast] = useState(last0);
  const [phone, setPhone] = useState(me.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const name = [first.trim(), last.trim()].filter(Boolean).join(' ');
  const changes: { name?: string; phone?: string } = {};
  if (name !== splitName(me.name).filter(Boolean).join(' ')) changes.name = name;
  if (phone.trim() !== (me.phone ?? '')) changes.phone = phone.trim();
  const changed = Object.keys(changes).length > 0;

  async function save(): Promise<void> {
    setDone(null);
    if (first.trim().length < 1 || name.length < 2) {
      setError(tr('Enter your first name.'));
      return;
    }
    if (!changed) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateMe(changes);
      setDone(tr('Profile saved.'));
      await refresh();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  const nigerian = phone.replace(/[\s-]/g, '').startsWith('+234');
  return (
    <Form label={tr('Profile')} onSubmit={() => void save()}>
      <div style={grid}>
        <TextInput label={tr('First Name')} value={first} onChange={setFirst} autoComplete="given-name" testId="me-first" />
        <TextInput label={tr('Last Name')} value={last} onChange={setLast} autoComplete="family-name" required={false} testId="me-last" />
        <TextInput label={tr('Email Address')} type="email" value={me.email} onChange={() => undefined} readOnly testId="me-email" />
        <TextInput
          label={tr('Phone Number')}
          value={phone}
          onChange={setPhone}
          autoComplete="tel"
          ltr
          leading={nigerian ? <Flag flag="ng" size={22} /> : null}
          testId="me-phone"
        />
        <TextInput label={tr('Role')} value={roleLabel(me.role)} onChange={() => undefined} readOnly testId="me-role" />
        <TextInput label={tr('Staff ID')} value={me.id.slice(0, 8).toUpperCase()} onChange={() => undefined} readOnly ltr testId="me-id" />
      </div>
      <p style={{ margin: 0, fontSize: 12, color: color.text.secondary }}>
        {tr('Your email and role are changed by staff who manage accounts.')}
      </p>
      <FormError message={error} />
      <Notice message={done} />
      <div style={footer}>
        <Button type="submit" busy={busy} disabled={!changed} testId="me-save">
          {tr('Save')}
        </Button>
      </div>
    </Form>
  );
}

function PasswordTab(): ReactElement {
  const { api } = useSession();
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
      <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{tr('Change Password')}</h2>
      <Form label={tr('Change Password')} onSubmit={() => void save()}>
        <div style={grid}>
          <TextInput label={tr('Old Password')} type="password" autoComplete="current-password" value={current} onChange={setCurrent} testId="pw-current" />
          <span />
          <TextInput label={tr('New Password')} type="password" autoComplete="new-password" value={next} onChange={setNext} testId="pw-new" />
          <TextInput label={tr('Confirm New Password')} type="password" autoComplete="new-password" value={again} onChange={setAgain} testId="pw-again" />
        </div>
        <p style={{ margin: 0, fontSize: 12, color: color.text.secondary }}>{tr(PASSWORD_HINT)}</p>
        <FormError message={error} />
        <Notice message={done} />
        <div style={footer}>
          <Button type="submit" busy={busy} disabled={!current || !next || !again} testId="pw-save">
            {tr('Change Password')}
          </Button>
        </div>
      </Form>
      <div style={{ borderTop: `1px solid ${color.border.subtle}`, margin: '24px -24px 0', padding: '20px 24px 0' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>{tr('Two-Factor Authentication')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            role="switch"
            aria-checked="true"
            aria-disabled="true"
            aria-label={tr('Two-Factor Authentication')}
            aria-describedby="twofa-why"
            data-testid="twofa"
            style={{ width: 40, height: 24, borderRadius: 12, backgroundColor: color.brand.fill, position: 'relative', display: 'inline-block', opacity: 0.9 }}
          >
            <span style={{ position: 'absolute', top: 3, insetInlineEnd: 3, width: 18, height: 18, borderRadius: '50%', backgroundColor: '#fff' }} />
          </span>
          <span style={{ fontSize: 13, color: color.text.secondary }}>{tr('Enabled')}</span>
        </div>
        <p id="twofa-why" style={{ margin: '8px 0 0', fontSize: 12, color: color.text.secondary }}>
          {tr('An email code is needed every time you log in with your email and password. It is always on for staff.')}
        </p>
      </div>
      <div style={{ borderTop: `1px solid ${color.border.subtle}`, margin: '24px -24px 0', padding: '20px 24px 0' }}>
        <SecurityKeys api={api} />
      </div>
    </>
  );
}

const card: CSSProperties = {
  backgroundColor: color.bg.canvas,
  borderRadius: 16,
  boxSizing: 'border-box',
  position: 'relative',
};

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '20px 28px',
};

const footer: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  borderTop: `1px solid ${color.border.subtle}`,
  paddingTop: 12,
  marginTop: 8,
};
