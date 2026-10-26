'use client';

/**
 * Staff (ADR-060), after the Figma "Staff Creation" frames: the list with search, a status
 * filter and a ⋮ menu per row, and an "Add Staff" form.
 *
 * Actions appear only where the server would allow them (your own permissions cover the
 * role; never yourself; Super Admins only by a Super Admin). The server checks again.
 * Phone (required) and photo per the owner, 2026-10-26; Figma's typed User ID is not here —
 * staff IDs are made by the server (ADR-051).
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';

import { AdminApiError, messageFor, type AdminApi, type RoleView, type StaffView } from '../../lib/api';
import { roleLabel } from '../../lib/permissions';
import { useStaffPhoto } from '../../lib/photos';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { color, space } from '../../theme';
import { Avatar, PhotoPicker } from '../Avatar';
import { BarSelect, FilterBar, SearchBox } from '../FilterBar';
import { Button, Form, FormError, Notice, PageTitle, Select, TextInput } from '../forms';
import { Panel } from '../primitives';
import { RowMenu, type RowAction } from '../RowMenu';
import { DataTable, type Column } from '../table/DataTable';
import { StaffStatus, when, withinMine } from './common';

type StatusFilter = '' | 'active' | 'invited' | 'disabled';

/** International form, as the server requires: + and 8–15 digits (spaces allowed while typing). */
export function cleanPhone(value: string): string | null {
  const compact = value.replace(/[\s()-]/g, '');
  return /^\+[1-9][0-9]{7,14}$/.test(compact) ? compact : null;
}

const PHONE_HINT = 'International form, e.g. +234 803 123 4567';

function StaffName({ api, staff, you }: { api: AdminApi; staff: StaffView; you: boolean }): ReactElement {
  const src = useStaffPhoto(api, staff.id, staff.has_photo);
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Avatar name={staff.name} src={src} size={28} />
      {you ? tr('{{name}} (you)', { name: staff.name }) : staff.name}
    </span>
  );
}

function statusOf(s: StaffView): Exclude<StatusFilter, ''> {
  if (s.status === 'disabled') return 'disabled';
  return s.password_set ? 'active' : 'invited';
}

export function StaffScreen({
  origin = typeof window === 'undefined' ? '' : window.location.origin,
}: {
  /** For the invite link shown after inviting. */
  origin?: string;
}): ReactElement {
  const { me, can, api } = useSession();
  const [staff, setStaff] = useState<StaffView[] | null>(null);
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffView | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setStaff(await api.listStaff());
    } catch (e) {
      setLoadError(messageFor(e));
    }
    try {
      setRoles(await api.listRoles());
    } catch (e) {
      // Without roles.read the role names still show; only inviting/changing roles is off.
      if (!(e instanceof AdminApiError && e.status === 403)) setLoadError(messageFor(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const isSuper = me.role === 'super_admin';
  const assignable = roles.filter((r) => (r.name === 'super_admin' ? isSuper : withinMine(r.permissions, can)));
  const canActOn = (s: StaffView): boolean => {
    if (s.id === me.id || !can('staff.update')) return false;
    if (s.role === 'super_admin') return isSuper;
    const r = roles.find((x) => x.id === s.role_id);
    return r ? withinMine(r.permissions, can) : false;
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (staff ?? []).filter(
      (s) =>
        (!q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)) &&
        (!status || statusOf(s) === status),
    );
  }, [staff, search, status]);

  async function update(s: StaffView, changes: { status: 'active' | 'disabled' }): Promise<void> {
    setRowError(null);
    setNotice(null);
    try {
      await api.updateStaff(s.id, changes);
      setNotice(
        changes.status === 'disabled'
          ? tr('{{name}} is disabled and was logged out.', { name: s.name })
          : tr('{{name}} can log in again.', { name: s.name }),
      );
      await load();
    } catch (e) {
      setRowError(messageFor(e));
    }
  }

  const actionsFor = (s: StaffView): RowAction[] => {
    if (!canActOn(s)) return [];
    const out: RowAction[] = [{ label: tr('Edit'), testId: `edit-${s.id}`, onSelect: () => setEditing(s) }];
    out.push(
      s.status === 'active'
        ? { label: tr('Disable'), danger: true, testId: `disable-${s.id}`, onSelect: () => void update(s, { status: 'disabled' }) }
        : { label: tr('Enable'), testId: `enable-${s.id}`, onSelect: () => void update(s, { status: 'active' }) },
    );
    return out;
  };

  const columns: readonly Column<StaffView>[] = [
    { key: 'name', header: tr('NAME'), render: (s) => <StaffName api={api} staff={s} you={s.id === me.id} /> },
    { key: 'email', header: tr('E-MAIL ADDRESS'), render: (s) => s.email },
    { key: 'phone', header: tr('Phone Number'), render: (s) => (s.phone ? <span dir="ltr">{s.phone}</span> : '—') },
    { key: 'role', header: tr('Role'), render: (s) => roleLabel(s.role) },
    { key: 'status', header: tr('Status'), render: (s) => <StaffStatus status={s.status} passwordSet={s.password_set} /> },
    { key: 'last', header: tr('Last log-in'), render: (s) => when(s.last_login_at) },
    {
      key: 'actions',
      header: tr('ACTION'),
      render: (s) => <RowMenu label={tr('Actions for {{name}}', { name: s.name })} actions={actionsFor(s)} testId={`menu-${s.id}`} />,
    },
  ];

  if (adding) {
    return (
      <>
        <PageTitle crumb={tr('Staff')}>{tr('Add Staff')}</PageTitle>
        <AddStaffForm
          api={api}
          roles={assignable}
          onCancel={() => setAdding(false)}
          onInvited={(inviteId, name) => {
            setAdding(false);
            setNotice(tr('Invitation sent to {{name}}.', { name }));
            setInviteLink(`${origin}/set-password?id=${encodeURIComponent(inviteId)}`);
            void load();
          }}
        />
      </>
    );
  }

  return (
    <>
      <PageTitle
        crumb={tr('Staff')}
        action={
          can('staff.create') ? (
            <Button testId="add-staff" onClick={() => { setInviteLink(null); setAdding(true); }}>
              {tr('Add Staff')}
            </Button>
          ) : undefined
        }
      >
        {tr('Staff')}
      </PageTitle>
      <FormError message={rowError} />
      <Notice message={notice} />
      {inviteLink ? (
        <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 16px', borderRadius: 8, backgroundColor: color.bg.canvas, border: `1px solid ${color.border.subtle}` }}>
          <span style={{ color: color.text.secondary }}>
            {tr('They got a 6-digit code by email. Send them this link to set their password with it (the link alone does nothing without the code):')}
          </span>
          <code data-testid="invite-link" style={{ wordBreak: 'break-all' }}>
            {inviteLink}
          </code>
        </div>
      ) : null}
      {editing ? (
        <EditStaff
          key={editing.id}
          api={api}
          staff={editing}
          roles={assignable}
          onCancel={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setRowError(null);
            setNotice(message);
            void load();
          }}
        />
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <SearchBox value={search} onChange={setSearch} placeholder={tr('Search name or email')} testId="staff-search" />
        <FilterBar onReset={search || status ? () => { setSearch(''); setStatus(''); } : undefined}>
          <BarSelect
            label={tr('Status')}
            value={status}
            onChange={(v) => setStatus(v as StatusFilter)}
            testId="staff-status"
            options={[
              { value: '', label: tr('Status') },
              { value: 'active', label: tr('Active') },
              { value: 'invited', label: tr('Invited') },
              { value: 'disabled', label: tr('Disabled') },
            ]}
          />
        </FilterBar>
      </div>
      <Panel>
        <DataTable
          caption={tr('Staff')}
          hideCaption
          columns={columns}
          rows={shown}
          status={loadError ? 'error' : staff === null ? 'loading' : 'ready'}
          onRetry={() => void load()}
          emptyTitle={search || status ? tr('No staff match your search') : tr('No staff yet')}
        />
      </Panel>
    </>
  );
}

function EditStaff({
  api,
  staff,
  roles,
  onCancel,
  onSaved,
}: {
  api: AdminApi;
  staff: StaffView;
  roles: RoleView[];
  onCancel: () => void;
  onSaved: (message: string) => void;
}): ReactElement {
  const current = useStaffPhoto(api, staff.id, staff.has_photo);
  const [name, setName] = useState(staff.name);
  const [phone, setPhone] = useState(staff.phone ?? '+234');
  const [roleId, setRoleId] = useState(staff.role_id);
  const [photo, setPhoto] = useState<{ base64: string; preview: string } | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const known = roles.some((r) => r.id === staff.role_id);

  async function save(): Promise<void> {
    const cleanedPhone = cleanPhone(phone);
    if (name.trim().length < 2) return setError(tr('Enter their name.'));
    if (!cleanedPhone) return setError(tr('Enter a valid phone number. International form, e.g. +234 803 123 4567.'));
    const changes: { name?: string; phone?: string; role_id?: string } = {};
    if (name.trim() !== staff.name) changes.name = name.trim();
    if (cleanedPhone !== staff.phone) changes.phone = cleanedPhone;
    if (roleId !== staff.role_id) changes.role_id = roleId;
    setBusy(true);
    setError(null);
    try {
      if (Object.keys(changes).length > 0) await api.updateStaff(staff.id, changes);
      if (photo) await api.setPhoto(staff.id, photo.base64);
      else if (removePhoto) await api.removePhoto(staff.id);
      onSaved(
        changes.role_id
          ? tr('{{name}} is saved. Their role changed, so they were logged out and see it when they log in.', { name: name.trim() })
          : tr('{{name}} is saved.', { name: name.trim() }),
      );
    } catch (e) {
      setError(messageFor(e));
      setBusy(false);
    }
  }

  return (
    <Panel>
      <h2 style={{ margin: 0, fontSize: 16 }}>{tr('Edit {{name}}', { name: staff.name })}</h2>
      <Form label={tr('Edit {{name}}', { name: staff.name })} onSubmit={() => void save()}>
        <PhotoPicker
          preview={photo?.preview ?? (removePhoto ? null : current)}
          onPick={(p) => {
            setPhoto(p);
            setRemovePhoto(false);
          }}
          onRemove={() => {
            setPhoto(null);
            setRemovePhoto(true);
          }}
          testId={`photo-${staff.id}`}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${space.sm}px 40px`, maxWidth: 680, width: '100%', margin: '0 auto' }}>
          <TextInput label={tr('Name')} value={name} onChange={setName} testId={`name-${staff.id}`} />
          <TextInput label={tr('Phone Number')} value={phone} onChange={setPhone} inputMode="text" hint={tr(PHONE_HINT)} ltr testId={`phone-${staff.id}`} />
          {roles.length > 0 ? (
            <Select
              label={tr('Role')}
              value={roleId}
              onChange={setRoleId}
              testId={`role-${staff.id}`}
              options={[
                ...(known ? [] : [{ value: staff.role_id, label: roleLabel(staff.role), disabled: true }]),
                ...roles.map((r) => ({ value: r.id, label: roleLabel(r.name) })),
              ]}
            />
          ) : null}
        </div>
        <div style={{ maxWidth: 680, width: '100%', margin: '0 auto' }}>
          <FormError message={error} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space.sm, maxWidth: 680, width: '100%', margin: '0 auto' }}>
          <Button variant="secondary" onClick={onCancel}>
            {tr('Cancel')}
          </Button>
          <Button type="submit" busy={busy} testId={`save-${staff.id}`}>
            {tr('Save')}
          </Button>
        </div>
      </Form>
    </Panel>
  );
}

function AddStaffForm({
  api,
  roles,
  onCancel,
  onInvited,
}: {
  api: AdminApi;
  roles: RoleView[];
  onCancel: () => void;
  onInvited: (inviteId: string, name: string) => void;
}): ReactElement {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+234');
  const [roleId, setRoleId] = useState('');
  const [photo, setPhoto] = useState<{ base64: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = first.trim() !== '' && last.trim() !== '' && email.trim() !== '' && roleId !== '' && phone.trim().length > 4;

  async function save(): Promise<void> {
    if (!ready) {
      setError(tr('Enter their first name, last name, email and phone number, and choose a role.'));
      return;
    }
    const cleanedPhone = cleanPhone(phone);
    if (!cleanedPhone) {
      setError(tr('Enter a valid phone number. International form, e.g. +234 803 123 4567.'));
      return;
    }
    setBusy(true);
    setError(null);
    const name = `${first.trim()} ${last.trim()}`;
    try {
      const r = await api.inviteStaff(email.trim(), name, roleId, cleanedPhone);
      if (photo) {
        try {
          await api.setPhoto(r.id, photo.base64);
        } catch {
          // The account exists; the photo can be added from Edit. Say so rather than fail.
          onInvited(r.invite_id, tr('{{name}} (the photo didn’t save — add it from Edit)', { name }));
          return;
        }
      }
      onInvited(r.invite_id, name);
    } catch (e) {
      setError(messageFor(e));
      setBusy(false);
    }
  }

  return (
    <Panel>
      {roles.length === 0 ? (
        <p style={{ margin: 0, color: color.text.secondary }}>
          {tr('There is no role you can give (you can only give roles within your own permissions).')}
        </p>
      ) : (
        <Form label={tr('Add Staff')} onSubmit={() => void save()}>
          <div style={{ marginTop: 16 }}>
            <PhotoPicker preview={photo?.preview ?? null} onPick={setPhoto} onRemove={() => setPhoto(null)} testId="invite-photo" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${space.sm}px 40px`, maxWidth: 680, width: '100%', margin: '8px auto 0' }}>
            <TextInput label={tr('First Name')} placeholder={tr('enter')} value={first} onChange={setFirst} testId="invite-first" />
            <TextInput label={tr('Last Name')} placeholder={tr('enter')} value={last} onChange={setLast} testId="invite-last" />
            <TextInput label={tr('Email address')} type="email" placeholder={tr('enter')} value={email} onChange={setEmail} testId="invite-email" />
            <TextInput label={tr('Phone Number')} value={phone} onChange={setPhone} hint={tr(PHONE_HINT)} ltr testId="invite-phone" />
            <Select
              label={tr('Role')}
              value={roleId}
              onChange={setRoleId}
              testId="invite-role"
              options={[
                { value: '', label: tr('Select'), disabled: true },
                ...roles.map((r) => ({ value: r.id, label: roleLabel(r.name) })),
              ]}
            />
          </div>
          <p style={{ margin: '0 auto', maxWidth: 680, width: '100%', fontSize: 13, color: color.text.secondary }}>
            {tr('They get a 6-digit code by email and set their own password. Their staff ID is made automatically.')}
          </p>
          <div style={{ maxWidth: 680, width: '100%', margin: '0 auto' }}>
            <FormError message={error} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space.sm, maxWidth: 680, width: '100%', margin: '16px auto 8px' }}>
            <Button variant="secondary" onClick={onCancel}>
              {tr('Cancel')}
            </Button>
            <Button type="submit" busy={busy} disabled={!ready} testId="invite-submit">
              {tr('Save Staff')}
            </Button>
          </div>
        </Form>
      )}
    </Panel>
  );
}
