/**
 * The admin console's only way to reach the server (ADR-060).
 *
 * * Same origin: the browser calls `/api/v1/admin/...` on the console's own address and the
 *   console server forwards it (next.config.ts rewrites), so the httpOnly session cookie is
 *   sent without opening cross-site access.
 * * Every call carries `X-Xspeeria-Admin: 1` — the server refuses admin calls without it
 *   (cross-site request forgery guard).
 * * The session cookie is httpOnly: this code never sees it, stores it or logs it. Nothing
 *   here logs at all (request bodies hold passwords and codes).
 */

export class AdminApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

export type Fetch = typeof fetch;

export interface StaffView {
  id: string;
  email: string;
  name: string;
  /** International form (+234…); null for accounts made before phones were required. */
  phone: string | null;
  has_photo: boolean;
  role_id: string;
  role: string;
  status: 'active' | 'disabled';
  password_set: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface Me extends StaffView {
  permissions: string[];
}

export interface RoleView {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  builtin: boolean;
  editable: boolean;
  staff_count: number;
}

export interface AuditItem {
  id: number;
  at: string;
  staff_id: string | null;
  staff_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, unknown> | null;
  ip_address: string | null;
}

export interface AuditPage {
  items: AuditItem[];
  next_before: number | null;
}

const BASE = '/api/v1/admin';

export function makeAdminApi(doFetch: Fetch = (...a) => fetch(...a)) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await doFetch(`${BASE}${path}`, {
        method,
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'X-Xspeeria-Admin': '1',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new AdminApiError('NETWORK', 0, 'Can’t reach the Xspeeria server. Check that it is running.');
    }
    if (response.status === 204) return undefined as T;
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (response.ok) return data as T;
    const err = (data as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null)
      ?.error;
    throw new AdminApiError(
      typeof err?.code === 'string' ? err.code : `HTTP_${response.status}`,
      response.status,
      typeof err?.message === 'string' ? err.message : 'Something went wrong. Please try again.',
      err?.details && typeof err.details === 'object' ? (err.details as Record<string, unknown>) : null,
    );
  }

  return {
    login: (email: string, password: string) =>
      call<{ challenge_id: string; email: string }>('POST', '/auth/login', { email, password }),
    verify: (challengeId: string, code: string) =>
      call<Me>('POST', '/auth/verify', { challenge_id: challengeId, code }),
    logout: () => call<void>('POST', '/auth/logout'),
    forgot: (email: string) => call<{ reset_id: string }>('POST', '/auth/forgot-password', { email }),
    reset: (resetId: string, code: string, newPassword: string) =>
      call<void>('POST', '/auth/reset-password', {
        reset_id: resetId,
        code,
        new_password: newPassword,
      }),
    me: () => call<Me>('GET', '/me'),
    changePassword: (current: string, next: string) =>
      call<void>('POST', '/me/password', { current_password: current, new_password: next }),
    listStaff: () => call<StaffView[]>('GET', '/staff'),
    inviteStaff: (email: string, name: string, roleId: string, phone: string) =>
      call<StaffView & { invite_id: string }>('POST', '/staff', { email, name, role_id: roleId, phone }),
    updateStaff: (
      id: string,
      changes: { name?: string; phone?: string; role_id?: string; status?: 'active' | 'disabled' },
    ) => call<StaffView>('PATCH', `/staff/${encodeURIComponent(id)}`, changes),
    /** `photo`: the file as base64 (JPEG, PNG or WebP; the server cleans and checks it). */
    setPhoto: (id: string, photo: string) =>
      call<StaffView>('PUT', `/staff/${encodeURIComponent(id)}/photo`, { photo }),
    removePhoto: (id: string) => call<void>('DELETE', `/staff/${encodeURIComponent(id)}/photo`),
    /** The photo as a local object URL (null: none). Fetched with the admin header. */
    photoUrl: async (id: string): Promise<string | null> => {
      let response: Response;
      try {
        response = await doFetch(`${BASE}/staff/${encodeURIComponent(id)}/photo`, {
          credentials: 'same-origin',
          headers: { 'X-Xspeeria-Admin': '1' },
        });
      } catch {
        return null;
      }
      if (!response.ok) return null;
      const blob = await response.blob();
      return /^image\/(jpeg|png|webp)$/.test(blob.type) ? URL.createObjectURL(blob) : null;
    },
    listRoles: () => call<RoleView[]>('GET', '/roles'),
    createRole: (name: string, description: string, permissions: string[]) =>
      call<RoleView>('POST', '/roles', { name, description, permissions }),
    updateRole: (id: string, changes: { description?: string; permissions?: string[] }) =>
      call<RoleView>('PATCH', `/roles/${encodeURIComponent(id)}`, changes),
    deleteRole: (id: string) => call<void>('DELETE', `/roles/${encodeURIComponent(id)}`),
    auditLog: (q: { action?: string; staffId?: string; before?: number; limit?: number } = {}) => {
      const params = new URLSearchParams();
      if (q.action) params.set('action', q.action);
      if (q.staffId) params.set('staff_id', q.staffId);
      if (q.before) params.set('before', String(q.before));
      params.set('limit', String(q.limit ?? 50));
      return call<AuditPage>('GET', `/audit-log?${params.toString()}`);
    },
  };
}

export type AdminApi = ReturnType<typeof makeAdminApi>;

/** The one instance the pages use. Tests build their own with a fake fetch. */
export const adminApi: AdminApi = makeAdminApi();

/** Words for the operator. Server messages are already written for people. */
export function messageFor(error: unknown): string {
  if (!(error instanceof AdminApiError)) return 'Something went wrong. Please try again.';
  if (error.code === 'AUTH_429_RATE_LIMITED') {
    const wait = Number(error.details?.retry_after_seconds);
    if (Number.isFinite(wait) && wait > 0) {
      const minutes = Math.ceil(wait / 60);
      return wait < 90
        ? `Too many attempts. Try again in ${wait} seconds.`
        : `Too many attempts. Try again in ${minutes} minutes.`;
    }
  }
  return error.message;
}
