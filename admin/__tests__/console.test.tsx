/**
 * Admin console screens (ADR-060) against a fake server. The real server checks every
 * permission again; these tests cover what the console sends and shows.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AuditScreen } from '../components/screens/AuditScreen';
import { LoginScreen } from '../components/screens/LoginScreen';
import { ProfileScreen } from '../components/screens/ProfileScreen';
import { RolesScreen } from '../components/screens/RolesScreen';
import { SetPasswordScreen } from '../components/screens/SetPasswordScreen';
import { StaffScreen } from '../components/screens/StaffScreen';
import { AdminApiError, makeAdminApi, messageFor, type AdminApi, type Me, type RoleView, type StaffView } from '../lib/api';
import { SessionProvider } from '../lib/session';

const ALL = ['dashboard', 'users', 'kyc', 'disputes', 'reversals', 'fraud_alerts', 'outages', 'staff', 'roles', 'audit'].flatMap(
  (m) => ['read', 'create', 'update', 'delete', 'approve'].map((a) => `${m}.${a}`),
);

const ROLES: RoleView[] = [
  { id: 'r-super', name: 'super_admin', description: 'All', permissions: ALL, builtin: true, editable: false, staff_count: 1 },
  { id: 'r-support', name: 'support_agent', description: 'Support', permissions: ['users.read', 'disputes.read'], builtin: true, editable: true, staff_count: 1 },
  { id: 'r-comp', name: 'compliance_officer', description: 'KYC', permissions: ['kyc.read', 'kyc.update', 'audit.read'], builtin: true, editable: true, staff_count: 0 },
  { id: 'r-temp', name: 'temp_viewer', description: '', permissions: ['users.read'], builtin: false, editable: true, staff_count: 0 },
];

function me(over: Partial<Me> = {}): Me {
  return {
    id: 's-boss',
    email: 'boss@xspeeria.test',
    name: 'The Boss',
    role_id: 'r-super',
    role: 'super_admin',
    status: 'active',
    password_set: true,
    last_login_at: '2026-10-26T09:00:00Z',
    created_at: '2026-10-26T08:00:00Z',
    permissions: ALL,
    ...over,
  };
}

const STAFF: StaffView[] = [
  { ...me(), permissions: undefined } as unknown as StaffView,
  { id: 's-agent', email: 'agent@xspeeria.test', name: 'Ada Agent', role_id: 'r-support', role: 'support_agent', status: 'active', password_set: true, last_login_at: null, created_at: '2026-10-26T08:00:00Z' },
  { id: 's-new', email: 'new@xspeeria.test', name: 'New Person', role_id: 'r-support', role: 'support_agent', status: 'active', password_set: false, last_login_at: null, created_at: '2026-10-26T08:00:00Z' },
];

function fakeApi(over: Partial<AdminApi> = {}, who: Me = me()): AdminApi {
  const api = makeAdminApi(vi.fn());
  return {
    ...api,
    me: vi.fn(async () => who),
    listStaff: vi.fn(async () => STAFF),
    listRoles: vi.fn(async () => ROLES),
    ...over,
  };
}

async function signedIn(api: AdminApi, ui: ReactNode): Promise<void> {
  render(<SessionProvider api={api} onSignedOut={() => undefined}>{ui as ReactElement}</SessionProvider>);
  await screen.findByRole('heading', { level: 1 });
}

// --- API client ------------------------------------------------------------------------------

describe('admin API client', () => {
  it('sends the admin header, same-origin cookies and JSON, and never a token', async () => {
    const doFetch = vi.fn(async () => new Response(JSON.stringify({ challenge_id: 'c', email: 'b***@x' }), { status: 200 }));
    await makeAdminApi(doFetch).login('boss@xspeeria.test', 'pw');
    const [url, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/admin/auth/login');
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>)['X-Xspeeria-Admin']).toBe('1');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('turns the server error envelope into an AdminApiError', async () => {
    const doFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: 'AUTH_429_RATE_LIMITED', message: 'Too many', details: { retry_after_seconds: 900 } } }),
          { status: 429 },
        ),
    );
    const err = await makeAdminApi(doFetch).login('a@b.co', 'x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdminApiError);
    expect((err as AdminApiError).code).toBe('AUTH_429_RATE_LIMITED');
    expect(messageFor(err)).toBe('Too many attempts. Try again in 15 minutes.');
  });

  it('reports a server it cannot reach in words', async () => {
    const err = await makeAdminApi(vi.fn(async () => Promise.reject(new TypeError('x')))).me().catch((e: unknown) => e);
    expect(messageFor(err)).toMatch(/Can’t reach the Xspeeria server/);
  });

  it('encodes ids it puts in paths', async () => {
    const doFetch = vi.fn(async () => new Response(null, { status: 204 }));
    await makeAdminApi(doFetch).deleteRole('../staff');
    expect((doFetch.mock.calls[0] as unknown as [string])[0]).toBe('/api/v1/admin/roles/..%2Fstaff');
  });
});

// --- sign-in -----------------------------------------------------------------------------------

describe('log-in', () => {
  it('asks for the password, then the email code, then signs in', async () => {
    const login = vi.fn(async () => ({ challenge_id: 'ch-1', email: 'b***@xspeeria.test' }));
    const verify = vi.fn(async () => me());
    const onSignedIn = vi.fn();
    render(<LoginScreen api={fakeApi({ login, verify })} onSignedIn={onSignedIn} />);
    fireEvent.change(screen.getByTestId('login-email'), { target: { value: ' boss@xspeeria.test ' } });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'secret words here' } });
    fireEvent.click(screen.getByTestId('login-submit'));
    expect(await screen.findByText(/received via email at b\*\*\*@xspeeria.test/)).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith('boss@xspeeria.test', 'secret words here');
    fireEvent.change(screen.getByTestId('login-code'), { target: { value: '12a34 56' } });
    expect(screen.getByTestId('login-code')).toHaveValue('123456');
    fireEvent.click(screen.getByTestId('login-verify'));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(verify).toHaveBeenCalledWith('ch-1', '123456');
  });

  it('shows the server’s refusal and stays on the password step', async () => {
    const login = vi.fn(async () => {
      throw new AdminApiError('AUTH_401_INVALID_CREDENTIALS', 401, 'The email or password is incorrect.');
    });
    render(<LoginScreen api={fakeApi({ login })} onSignedIn={vi.fn()} />);
    fireEvent.change(screen.getByTestId('login-email'), { target: { value: 'x@y.co' } });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByTestId('login-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent('The email or password is incorrect.');
    expect(screen.getByTestId('login-password')).toBeInTheDocument();
  });

  it('checks the code shape before calling the server', async () => {
    const verify = vi.fn();
    render(<LoginScreen api={fakeApi({ login: vi.fn(async () => ({ challenge_id: 'c', email: 'e' })), verify })} onSignedIn={vi.fn()} />);
    fireEvent.change(screen.getByTestId('login-email'), { target: { value: 'x@y.co' } });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByTestId('login-submit'));
    await screen.findByTestId('login-code');
    fireEvent.change(screen.getByTestId('login-code'), { target: { value: '123' } });
    fireEvent.click(screen.getByTestId('login-verify'));
    expect(await screen.findByRole('alert')).toHaveTextContent('6-digit code');
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('set password', () => {
  it('forgot password: email, then code and matching passwords', async () => {
    const forgot = vi.fn(async () => ({ reset_id: 'rs-1' }));
    const reset = vi.fn(async () => undefined);
    const onDone = vi.fn();
    render(<SetPasswordScreen api={fakeApi({ forgot, reset })} onDone={onDone} />);
    fireEvent.change(screen.getByTestId('reset-email'), { target: { value: 'boss@xspeeria.test' } });
    fireEvent.click(screen.getByTestId('reset-send'));
    await screen.findByTestId('reset-code');
    fireEvent.change(screen.getByTestId('reset-code'), { target: { value: '654321' } });
    fireEvent.change(screen.getByTestId('reset-password'), { target: { value: 'long enough words' } });
    fireEvent.change(screen.getByTestId('reset-again'), { target: { value: 'different words!!' } });
    fireEvent.click(screen.getByTestId('reset-save'));
    expect(await screen.findByRole('alert')).toHaveTextContent('don’t match');
    expect(reset).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('reset-again'), { target: { value: 'long enough words' } });
    fireEvent.click(screen.getByTestId('reset-save'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(reset).toHaveBeenCalledWith('rs-1', '654321', 'long enough words');
  });

  it('an invitation link skips straight to the code', () => {
    render(<SetPasswordScreen api={fakeApi()} inviteId="inv-1" onDone={vi.fn()} />);
    expect(screen.getByText(/invitation email/)).toBeInTheDocument();
    expect(screen.queryByTestId('reset-email')).toBeNull();
  });

  it('shows the server’s password rule when it refuses', async () => {
    const reset = vi.fn(async () => {
      throw new AdminApiError('VAL_422_WEAK_PASSWORD', 422, 'Don’t use your email in your password.');
    });
    render(<SetPasswordScreen api={fakeApi({ reset })} inviteId="inv-1" onDone={vi.fn()} />);
    fireEvent.change(screen.getByTestId('reset-code'), { target: { value: '111111' } });
    fireEvent.change(screen.getByTestId('reset-password'), { target: { value: 'boss password ok' } });
    fireEvent.change(screen.getByTestId('reset-again'), { target: { value: 'boss password ok' } });
    fireEvent.click(screen.getByTestId('reset-save'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Don’t use your email');
  });
});

describe('session', () => {
  it('sends a signed-out person to log in', async () => {
    const onSignedOut = vi.fn();
    const api = fakeApi({
      me: vi.fn(async () => {
        throw new AdminApiError('AUTH_401_UNAUTHORIZED', 401, 'Please log in again.');
      }),
    });
    render(<SessionProvider api={api} onSignedOut={onSignedOut}><p>secret page</p></SessionProvider>);
    await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
    expect(screen.queryByText('secret page')).toBeNull();
  });
});

// --- staff -------------------------------------------------------------------------------------

describe('staff', () => {
  it('lists staff with status and offers no action on yourself', async () => {
    await signedIn(fakeApi(), <StaffScreen origin="https://admin.test" />);
    const table = await screen.findByRole('table', { name: 'Staff' });
    expect(await within(table).findByText('The Boss (you)')).toBeInTheDocument();
    expect(within(table).getAllByText('Invited').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('menu-s-boss')).toBeNull();
    fireEvent.click(screen.getByTestId('menu-s-agent'));
    expect(screen.getByTestId('disable-s-agent')).toBeInTheDocument();
    expect(screen.getByTestId('change-role-s-agent')).toBeInTheDocument();
  });

  it('search and status filter narrow the list, and reset clears them', async () => {
    await signedIn(fakeApi(), <StaffScreen origin="https://admin.test" />);
    const table = await screen.findByRole('table', { name: 'Staff' });
    await within(table).findByText('Ada Agent');
    fireEvent.change(screen.getByTestId('staff-search'), { target: { value: 'ada' } });
    expect(within(table).queryByText('New Person')).toBeNull();
    expect(within(table).getByText('Ada Agent')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('staff-search'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('staff-status'), { target: { value: 'invited' } });
    expect(within(table).getByText('New Person')).toBeInTheDocument();
    expect(within(table).queryByText('Ada Agent')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Reset Filter/ }));
    expect(within(table).getByText('Ada Agent')).toBeInTheDocument();
  });

  it('a support agent sees the list but no actions', async () => {
    const agent = me({ id: 's-agent', role: 'support_agent', role_id: 'r-support', permissions: ['staff.read'] });
    await signedIn(
      fakeApi({ listRoles: vi.fn(async () => Promise.reject(new AdminApiError('AUTH_403_FORBIDDEN', 403, 'No'))) }, agent),
      <StaffScreen origin="https://admin.test" />,
    );
    const table = await screen.findByRole('table', { name: 'Staff' });
    await within(table).findByText('The Boss');
    expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull();
    expect(screen.queryByTestId('add-staff')).toBeNull();
  });

  it('a manager can only add staff into roles within their own permissions', async () => {
    const manager = me({ id: 's-m', role: 'staff_manager', role_id: 'r-m', permissions: ['staff.read', 'staff.create', 'staff.update', 'users.read', 'disputes.read'] });
    await signedIn(fakeApi({}, manager), <StaffScreen origin="https://admin.test" />);
    await screen.findByRole('table', { name: 'Staff' });
    await waitFor(() => expect(screen.getByTestId('add-staff')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-staff'));
    const select = await screen.findByTestId('invite-role');
    await waitFor(() =>
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Select', 'Support agent', 'Temp viewer']),
    );
  });

  it('Add Staff sends first and last name together and shows the set-password link', async () => {
    const inviteStaff = vi.fn(async () => ({ ...STAFF[1], id: 's-x', invite_id: '11111111-2222-3333-4444-555555555555' }));
    await signedIn(fakeApi({ inviteStaff }), <StaffScreen origin="https://admin.test" />);
    await screen.findByRole('table', { name: 'Staff' });
    fireEvent.click(screen.getByTestId('add-staff'));
    expect(screen.getByTestId('invite-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('invite-first'), { target: { value: 'Kemi' } });
    fireEvent.change(screen.getByTestId('invite-last'), { target: { value: 'Okafor' } });
    fireEvent.change(screen.getByTestId('invite-email'), { target: { value: 'kemi@xspeeria.test' } });
    await waitFor(() => expect(within(screen.getByTestId('invite-role')).getAllByRole('option').length).toBeGreaterThan(1));
    fireEvent.change(screen.getByTestId('invite-role'), { target: { value: 'r-comp' } });
    fireEvent.click(screen.getByTestId('invite-submit'));
    expect(await screen.findByTestId('invite-link')).toHaveTextContent(
      'https://admin.test/set-password?id=11111111-2222-3333-4444-555555555555',
    );
    expect(inviteStaff).toHaveBeenCalledWith('kemi@xspeeria.test', 'Kemi Okafor', 'r-comp');
  });

  it('disabling from the row menu asks the server and says what happened', async () => {
    const updateStaff = vi.fn(async () => ({ ...STAFF[1], status: 'disabled' as const }));
    await signedIn(fakeApi({ updateStaff }), <StaffScreen origin="https://admin.test" />);
    fireEvent.click(await screen.findByTestId('menu-s-agent'));
    fireEvent.click(screen.getByTestId('disable-s-agent'));
    expect(await screen.findByText(/Ada Agent is disabled and was logged out/)).toBeInTheDocument();
    expect(updateStaff).toHaveBeenCalledWith('s-agent', { status: 'disabled' });
  });

  it('changing a role from the row menu', async () => {
    const updateStaff = vi.fn(async () => ({ ...STAFF[1], role: 'compliance_officer', role_id: 'r-comp' }));
    await signedIn(fakeApi({ updateStaff }), <StaffScreen origin="https://admin.test" />);
    fireEvent.click(await screen.findByTestId('menu-s-agent'));
    fireEvent.click(screen.getByTestId('change-role-s-agent'));
    expect(screen.getByTestId('save-role-s-agent')).toBeDisabled();
    fireEvent.change(screen.getByTestId('role-s-agent'), { target: { value: 'r-comp' } });
    fireEvent.click(screen.getByTestId('save-role-s-agent'));
    await waitFor(() => expect(updateStaff).toHaveBeenCalledWith('s-agent', { role_id: 'r-comp' }));
  });
});

// --- roles -------------------------------------------------------------------------------------

describe('roles', () => {
  it('Super Admin can’t be edited; unused custom roles can be deleted; built-in can’t', async () => {
    await signedIn(fakeApi(), <RolesScreen />);
    await screen.findByRole('table', { name: 'Roles' });
    expect(screen.queryByTestId('edit-super_admin')).toBeNull();
    expect(screen.getByTestId('edit-support_agent')).toBeInTheDocument();
    expect(screen.getByTestId('delete-temp_viewer')).toBeInTheDocument();
    expect(screen.queryByTestId('delete-support_agent')).toBeNull();
  });

  it('only permissions you hold can be ticked', async () => {
    const manager = me({ id: 's-m', role: 'role_manager', role_id: 'r-m', permissions: ['roles.read', 'roles.create', 'users.read'] });
    const createRole = vi.fn(async () => ROLES[3]);
    await signedIn(fakeApi({ createRole }, manager), <RolesScreen />);
    fireEvent.click(await screen.findByTestId('new-role'));
    expect(screen.getByTestId('perm-users.read')).toBeEnabled();
    expect(screen.getByTestId('perm-audit.read')).toBeDisabled();
    expect(screen.getByTestId('perm-kyc.approve')).toBeDisabled();
    fireEvent.change(screen.getByTestId('role-name'), { target: { value: 'Viewer_Two' } });
    expect(screen.getByTestId('role-name')).toHaveValue('viewer_two');
    fireEvent.click(screen.getByTestId('perm-users.read'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('role-save'));
    });
    expect(createRole).toHaveBeenCalledWith('viewer_two', '', ['users.read']);
  });

  it('“Full access” ticks only the actions you hold', async () => {
    const manager = me({ id: 's-m', role: 'role_manager', role_id: 'r-m', permissions: ['roles.read', 'roles.create', 'kyc.read', 'kyc.update'] });
    await signedIn(fakeApi({}, manager), <RolesScreen />);
    fireEvent.click(await screen.findByTestId('new-role'));
    fireEvent.click(screen.getByLabelText('Identity checks (KYC): full access'));
    expect(screen.getByTestId('perm-kyc.read')).toBeChecked();
    expect(screen.getByTestId('perm-kyc.update')).toBeChecked();
    expect(screen.getByTestId('perm-kyc.approve')).not.toBeChecked();
  });
});

// --- audit and profile ------------------------------------------------------------------------

describe('audit log', () => {
  it('shows entries in words and loads older ones', async () => {
    const first = {
      items: [
        { id: 9, at: '2026-10-26T10:00:00Z', staff_id: 's-boss', staff_email: 'boss@xspeeria.test', action: 'staff_updated', target_type: 'staff', target_id: 's-agent', detail: { role: { from: 'support_agent', to: 'ops_admin' } }, ip_address: '127.0.0.1' },
      ],
      next_before: 9,
    };
    const older = {
      items: [
        { id: 3, at: '2026-10-26T09:00:00Z', staff_id: null, staff_email: null, action: 'login_failed', target_type: null, target_id: null, detail: { reason: 'unknown_or_inactive' }, ip_address: '10.0.0.2' },
      ],
      next_before: null,
    };
    const auditLog = vi.fn(async (q: { before?: number } = {}) => (q.before ? older : first));
    await signedIn(fakeApi({ auditLog }), <AuditScreen />);
    const table = await screen.findByRole('table', { name: 'Audit log' });
    expect(await within(table).findByText('Changed staff')).toBeInTheDocument();
    expect(within(table).getByText('role: Support agent → Operations admin')).toBeInTheDocument();
    expect(auditLog.mock.calls.filter((c) => !c[0]?.before)).toHaveLength(1); // first page asked once
    fireEvent.click(screen.getByTestId('audit-older'));
    const after = screen.getByRole('table', { name: 'Audit log' });
    expect(await within(after).findByText('Log-in failed')).toBeInTheDocument();
    expect(within(after).getByText('Unknown email')).toBeInTheDocument();
    expect(auditLog).toHaveBeenLastCalledWith({ action: undefined, before: 9, limit: 50 });
    expect(screen.queryByTestId('audit-older')).toBeNull();
    // Nothing on this page can change the log.
    expect(screen.queryByRole('button', { name: /delete|edit/i })).toBeNull();
  });
});

describe('profile', () => {
  it('changes my password', async () => {
    const changePassword = vi.fn(async () => undefined);
    await signedIn(fakeApi({ changePassword }), <ProfileScreen />);
    fireEvent.change(screen.getByTestId('pw-current'), { target: { value: 'old password' } });
    fireEvent.change(screen.getByTestId('pw-new'), { target: { value: 'a new long password' } });
    fireEvent.change(screen.getByTestId('pw-again'), { target: { value: 'a new long password' } });
    fireEvent.click(screen.getByTestId('pw-save'));
    expect(await screen.findByText(/You were logged out everywhere else/)).toBeInTheDocument();
    expect(changePassword).toHaveBeenCalledWith('old password', 'a new long password');
  });
});
