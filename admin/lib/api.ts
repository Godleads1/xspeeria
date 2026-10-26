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

import { tr } from './i18n';

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


/** Integer minor units as text, with the currency's scale (never a float). */
export interface MoneyFigure {
  currency: string;
  scale: number;
  minor: string;
  previous_minor?: string;
}
export interface Compared {
  value: number;
  previous: number;
}
export type DashboardPeriod = 'today' | 'month' | 'year' | 'custom';
export interface Dashboard {
  period: { kind: DashboardPeriod; start: string; end: string; bucket: 'hour' | 'day' | 'month' };
  overview: {
    active_users: Compared;
    new_users: Compared;
    trades_started: Compared;
    trades_completed: Compared;
    value: MoneyFigure[];
    fees: MoneyFigure[];
    avg_settlement_seconds: number | null;
    open_disputes: number;
    kyc_waiting: number;
    /** Per bucket (Lagos time) for the tiles' trend lines; only buckets with something in them. */
    series: {
      at: string;
      active_users: number;
      new_users: number;
      trades_started: number;
      trades_completed: number;
      settlement_seconds: number;
      disputes_opened: number;
      kyc_started: number;
    }[];
    value_by_time: (MoneyFigure & { at: string })[];
  };
  customers: {
    growth: { at: string; signed_up: number; not_verified: number }[];
    active_customers: number;
    inactive_30_days: number;
    by_status: Record<'active' | 'pending_verification' | 'suspended' | 'closed', number>;
  };
  transactions: { completed: number; failed: number; speed: Record<'lt_1m' | '1_5m' | '5_10m' | '10_60m' | 'gt_60m', number> };
  revenue: {
    fees_by_time: (MoneyFigure & { at: string })[];
    waiting_in_escrow: (MoneyFigure & { legs: number })[];
  };
  corridors: { pair: [string, string]; trades: number; previous_trades: number; average_rate: string | null }[];
  operations: {
    disputes_opened: Compared;
    disputes_resolved: Compared;
    mean_seconds_to_resolve: number | null;
    reconciliation_open: number;
    open_offers_paying_naira: number;
    open_offers_paying_foreign: number;
  };
}

export type CustomerStatus = 'active' | 'suspended' | 'closed';
export interface Customer {
  id: string;
  /** Short reference shown as the ID, e.g. "3F2A9C1B". */
  ref: string;
  /** Legal name from an approved identity check; null before one. */
  name: string | null;
  email: string;
  phone: string;
  status: CustomerStatus;
  kyc_status: string | null;
  created_at: string;
  last_login_at: string | null;
}
export interface CustomerPage {
  total: number;
  items: Customer[];
}
export interface CustomerStats {
  total: number;
  active_30_days: number;
  inactive_30_days: number;
  suspended: number;
  kyc_waiting: number;
}
export type CustomerAction = 'suspend' | 'reactivate' | 'close';

export type DisputeStatus = 'open' | 'under_review' | 'resolved';
export type DisputeOutcome = 'favor_initiator' | 'favor_counterparty' | 'split' | 'no_fault';
export type Priority = 'low' | 'medium' | 'high';
export interface DisputeCategory {
  code: string;
  name: string;
  description: string;
  active: boolean;
}
export interface DisputeRow {
  id: string;
  ref: string;
  kind: 'dispute' | 'support';
  customer: string;
  customer_email: string;
  category: string;
  category_name: string;
  status: DisputeStatus;
  priority: Priority;
  assigned_to: string | null;
  assigned_name: string | null;
  escalated: boolean;
  created_at: string;
  resolved_at: string | null;
  /** 24 hours after opening (owner decision 2026-10-26). */
  sla_due_at: string;
}
export interface DisputePage {
  /** Server time, so the SLA timer doesn't depend on this computer's clock. */
  now: string;
  total: number;
  items: DisputeRow[];
}
export interface DisputeStats {
  total: number;
  resolved_7_days: number;
  pending: number;
  overdue: number;
  avg_resolution_seconds: number | null;
}
export interface Person {
  id: string;
  name: string | null;
  email: string;
  phone: string;
  status: string;
}
export interface DisputeCase extends DisputeRow {
  /** Server time, for the SLA timer. */
  now: string;
  description: string;
  desired_resolution: string | null;
  opened_by_staff: boolean;
  customer_details: Person;
  deal: null | {
    transaction_id: string;
    match_id: string;
    rate: string;
    phase: string | null;
    escrow_paused: boolean;
    legs: { party: string; paid_by: string; currency: string; scale: number; amount_minor: string; fee_minor: string; state: string }[];
    other_party: Person;
  };
  /** Refund requests made from this case (ADR-065). */
  reversals: { id: string; ref: string; status: ReversalStatus }[];
  /** Whether a refund can be asked for now (display only; the server checks again). */
  can_refund: boolean;
  messages: { id: string; author: 'staff' | 'customer' | 'other_party'; staff_name: string | null; body: string; created_at: string }[];
  timeline: { at: string; who: 'staff' | 'customer'; name: string | null; event: string; detail: Record<string, unknown> | null }[];
}

export type ReversalStatus = 'pending' | 'approved' | 'rejected';
/** Money going back to one person: what they paid in, fee included (integer minor units). */
export interface ReversalReturn {
  currency: string;
  scale: number;
  minor: string;
}
export interface ReversalRow {
  id: string;
  ref: string;
  requested_by: string;
  customer: string;
  returns: ReversalReturn[];
  category_name: string;
  reason: string;
  status: ReversalStatus;
  requested_at: string;
  decided_at: string | null;
}
export interface ReversalPage {
  total: number;
  items: ReversalRow[];
}
export interface ReversalStats {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
}
export interface ReversalDetail {
  id: string;
  ref: string;
  status: ReversalStatus;
  reason: string;
  requested_by: string | null;
  requested_by_id: string;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  dispute: { id: string; ref: string; category_name: string; description: string; status: DisputeStatus };
  customer: { name: string | null; email: string | null; phone: string | null };
  deal: {
    transaction_id: string;
    phase: string;
    closure_reason: string | null;
    legs: { party: string; currency: string; scale: number; amount_minor: string; fee_minor: string; state: string }[];
  };
  returns: (ReversalReturn & { user_id: string; name: string | null; email: string | null; phone: string | null; state: string })[];
  can_return: boolean;
}

export type OutageSeverity = 'low' | 'medium' | 'high';
export type OutageStatus = 'open' | 'in_progress' | 'resolved';
export interface Outage {
  id: string;
  ref: string;
  service: string;
  /** What app users read in the banner. */
  message: string;
  severity: OutageSeverity;
  status: OutageStatus;
  started_at: string;
  expected_end_at: string | null;
  resolved_at: string | null;
  duration_seconds: number;
  reported_by: string;
  created_at: string;
  updated_at: string;
}
export interface OutagePage {
  now: string;
  total: number;
  items: Outage[];
}
export interface OutageInput {
  service: string;
  message: string;
  severity: OutageSeverity;
  started_at?: string;
  expected_end_at?: string | null;
}

export type AdvertState = 'showing' | 'covered' | 'scheduled' | 'ended' | 'off';
export interface Advert {
  id: string;
  name: string;
  width: number;
  height: number;
  starts_at: string;
  ends_at: string;
  link_url: string | null;
  active: boolean;
  state: AdvertState;
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface AdvertPage {
  now: string;
  total: number;
  showing_id: string | null;
  /** The app's advert slot in points (342 × 113). */
  slot: { width: number; height: number };
  items: Advert[];
}
export interface AdvertInput {
  name: string;
  /** base64 picture (JPEG, PNG or WebP). */
  image: string;
  starts_at: string;
  ends_at: string;
  link_url?: string | null;
}

export type FraudRule = 'pin_lockout' | 'code_lockout' | 'disputes_against' | 'payout_name_mismatch' | 'staff_report';
export type FraudStatus = 'open' | 'in_progress' | 'resolved';
export type FraudSeverity = 'low' | 'medium' | 'high';
export interface FraudAlertRow {
  id: string;
  ref: string;
  user_id: string;
  customer: string;
  customer_email: string;
  rule: FraudRule;
  severity: FraudSeverity;
  status: FraudStatus;
  /** What the rule found: counts, dates, bank and last 4 digits only. */
  details: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
  resolution: 'confirmed' | 'false_alarm' | null;
}
export interface FraudAlert extends FraudAlertRow {
  customer_status: string | null;
  customer_phone: string | null;
  note: string | null;
  resolution_note: string | null;
  raised_by: string | null;
  resolved_by: string | null;
  account_name?: string | null;
  verified_name?: string | null;
}
export interface FraudPage {
  total: number;
  items: FraudAlertRow[];
}
export interface FraudStats {
  open: number;
  in_progress: number;
  resolved: number;
  high_open: number;
}

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
    listCustomers: (q: { search?: string; status?: CustomerStatus; offset?: number; limit?: number }) => {
      const p = new URLSearchParams();
      if (q.search) p.set('q', q.search);
      if (q.status) p.set('status', q.status);
      p.set('offset', String(q.offset ?? 0));
      p.set('limit', String(q.limit ?? 50));
      return call<CustomerPage>('GET', `/users?${p.toString()}`);
    },
    customerStats: () => call<CustomerStats>('GET', '/users/stats'),
    disputeCategories: () => call<DisputeCategory[]>('GET', '/dispute-categories'),
    saveDisputeCategory: (code: string | null, body: { name: string; description: string; active: boolean }) =>
      code === null
        ? call<DisputeCategory>('POST', '/dispute-categories', body)
        : call<DisputeCategory>('PUT', `/dispute-categories/${encodeURIComponent(code)}`, body),
    listDisputes: (q: { search?: string; status?: DisputeStatus; mine?: boolean; offset?: number; limit?: number }) => {
      const p = new URLSearchParams();
      if (q.search) p.set('q', q.search);
      if (q.status) p.set('status', q.status);
      if (q.mine) p.set('mine', 'true');
      p.set('offset', String(q.offset ?? 0));
      p.set('limit', String(q.limit ?? 50));
      return call<DisputePage>('GET', `/disputes?${p.toString()}`);
    },
    disputeStats: () => call<DisputeStats>('GET', '/disputes/stats'),
    dispute: (id: string) => call<DisputeCase>('GET', `/disputes/${encodeURIComponent(id)}`),
    openDisputeFor: (body: {
      user_id: string;
      transaction_id?: string;
      category: string;
      description: string;
      desired_resolution?: string;
      priority: Priority;
    }) => call<{ id: string; ref: string }>('POST', '/disputes', body),
    replyDispute: (id: string, message: string) => call<void>('POST', `/disputes/${encodeURIComponent(id)}/messages`, { message }),
    startDispute: (id: string) => call<void>('POST', `/disputes/${encodeURIComponent(id)}/start`),
    assignDispute: (id: string, staffId: string | null) =>
      call<void>('POST', `/disputes/${encodeURIComponent(id)}/assign`, { staff_id: staffId }),
    escalateDispute: (id: string, reason: string) =>
      call<void>('POST', `/disputes/${encodeURIComponent(id)}/escalate`, { reason }),
    resolveDispute: (id: string, outcome: DisputeOutcome, note?: string) =>
      call<void>('POST', `/disputes/${encodeURIComponent(id)}/resolve`, { outcome, ...(note ? { note } : {}) }),
    requestRefund: (disputeId: string, reason: string) =>
      call<{ id: string; ref: string }>('POST', `/disputes/${encodeURIComponent(disputeId)}/refund`, { reason }),
    listReversals: (q: { search?: string; status?: ReversalStatus; offset?: number; limit?: number }) => {
      const p = new URLSearchParams();
      if (q.search) p.set('q', q.search);
      if (q.status) p.set('status', q.status);
      p.set('offset', String(q.offset ?? 0));
      p.set('limit', String(q.limit ?? 50));
      return call<ReversalPage>('GET', `/reversals?${p.toString()}`);
    },
    reversalStats: () => call<ReversalStats>('GET', '/reversals/stats'),
    reversal: (id: string) => call<ReversalDetail>('GET', `/reversals/${encodeURIComponent(id)}`),
    approveReversal: (id: string, note?: string) =>
      call<void>('POST', `/reversals/${encodeURIComponent(id)}/approve`, note ? { note } : {}),
    rejectReversal: (id: string, note: string) => call<void>('POST', `/reversals/${encodeURIComponent(id)}/reject`, { note }),
    listOutages: (q: { search?: string; status?: OutageStatus; offset?: number; limit?: number }) => {
      const p = new URLSearchParams();
      if (q.search) p.set('q', q.search);
      if (q.status) p.set('status', q.status);
      p.set('offset', String(q.offset ?? 0));
      p.set('limit', String(q.limit ?? 50));
      return call<OutagePage>('GET', `/outages?${p.toString()}`);
    },
    listAdverts: () => call<AdvertPage>('GET', '/adverts'),
    addAdvert: (body: AdvertInput) => call<{ id: string }>('POST', '/adverts', body),
    changeAdvert: (id: string, body: Partial<AdvertInput> & { active?: boolean }) =>
      call<void>('PATCH', `/adverts/${encodeURIComponent(id)}`, body),
    advertImageUrl: async (id: string): Promise<string | null> => {
      let response: Response;
      try {
        response = await doFetch(`${BASE}/adverts/${encodeURIComponent(id)}/image`, {
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
    listFraudAlerts: (q: { search?: string; status?: FraudStatus; rule?: FraudRule; offset?: number; limit?: number }) => {
      const p = new URLSearchParams();
      if (q.search) p.set('q', q.search);
      if (q.status) p.set('status', q.status);
      if (q.rule) p.set('rule', q.rule);
      p.set('offset', String(q.offset ?? 0));
      p.set('limit', String(q.limit ?? 50));
      return call<FraudPage>('GET', `/fraud-alerts?${p.toString()}`);
    },
    fraudStats: () => call<FraudStats>('GET', '/fraud-alerts/stats'),
    fraudAlert: (id: string) => call<FraudAlert>('GET', `/fraud-alerts/${encodeURIComponent(id)}`),
    reportFraud: (body: { user_id: string; severity: FraudSeverity; note: string }) =>
      call<{ id: string; ref: string }>('POST', '/fraud-alerts', body),
    startFraudAlert: (id: string) => call<void>('POST', `/fraud-alerts/${encodeURIComponent(id)}/start`),
    resolveFraudAlert: (id: string, resolution: 'confirmed' | 'false_alarm', note: string) =>
      call<void>('POST', `/fraud-alerts/${encodeURIComponent(id)}/resolve`, { resolution, note }),
    reportOutage: (body: OutageInput) => call<{ id: string; ref: string }>('POST', '/outages', body),
    changeOutage: (id: string, body: Partial<OutageInput> & { status?: OutageStatus }) =>
      call<void>('PATCH', `/outages/${encodeURIComponent(id)}`, body),
    /** Super Admin only (the server checks); a reason is required. */
    changeCustomer: (id: string, action: CustomerAction, reason: string) =>
      call<{ id: string; status: CustomerStatus }>('POST', `/users/${encodeURIComponent(id)}/${action}`, { reason }),
    dashboard: (period: DashboardPeriod, month?: string) =>
      call<Dashboard>(
        'GET',
        `/dashboard?period=${encodeURIComponent(period)}${month ? `&month=${encodeURIComponent(month)}` : ''}`,
      ),
    /** Only my name and phone; the server refuses anything else. */
    updateMe: (changes: { name?: string; phone?: string }) => call<Me>('PATCH', '/me', changes),
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
  if (!(error instanceof AdminApiError)) return tr('Something went wrong. Please try again.');
  if (error.code === 'AUTH_429_RATE_LIMITED') {
    const wait = Number(error.details?.retry_after_seconds);
    if (Number.isFinite(wait) && wait > 0) {
      const minutes = Math.ceil(wait / 60);
      return wait < 90
        ? tr('Too many attempts. Try again in {{count}} seconds.', { count: wait })
        : tr('Too many attempts. Try again in {{count}} minutes.', { count: minutes });
    }
  }
  // Server messages are English sentences; known ones have translations (lib/locales).
  return tr(error.message);
}
