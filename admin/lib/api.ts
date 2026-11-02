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
  /** ADR-081: signed in only to add a security key. */
  key_setup_only?: boolean;
}

/** ADR-081: after the email code, a Super Admin with a key touches it. */
export interface KeyStep {
  key_required: true;
  key_challenge_id: string;
  options: Record<string, unknown>;
}

export interface SecurityKey {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export interface SecurityKeyList {
  keys: SecurityKey[];
  required: boolean;
  can_add: boolean;
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

export type FraudRule = 'pin_lockout' | 'code_lockout' | 'disputes_against' | 'payout_name_mismatch' | 'staff_report' | 'customer_reported_not_me';
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

/** Customer activity log and deal timelines (ADR-073): Super Admin, kept 5 years. */
export type ActivityCategory = 'account' | 'security' | 'identity' | 'market' | 'deal' | 'payout' | 'dispute' | 'other' | 'staff';
export interface ActivityItem {
  source: 'customer' | 'staff';
  at: string;
  action: string;
  category: ActivityCategory;
  outcome: 'done' | 'refused' | 'failed';
  route: string | null;
  method: string | null;
  status: number | null;
  match_id: string | null;
  offer_id: string | null;
  ref_id: string | null;
  detail: Record<string, unknown> | null;
  device: string | null;
  country: string | null;
  staff_name: string | null;
  target_type: string | null;
  deal_ref: string | null;
}
export interface CustomerActivityPage {
  customer: { id: string; name: string | null; email: string; phone: string; status: string; joined_at: string };
  total: number;
  items: ActivityItem[];
}
export interface DealParty {
  id: string;
  email: string;
}
export interface DealRow {
  match_id: string;
  ref: string;
  transaction_id: string | null;
  taken_at: string;
  currency: string;
  counter_currency: string;
  amount: string;
  rate: string;
  offer_owner: DealParty;
  taker: DealParty;
  phase: string | null;
  closure_reason: string | null;
}
export interface DealEvent {
  at: string;
  kind: string;
  by: string;
  amount?: string | null;
  fee?: string | null;
  currency?: string | null;
  rate?: string;
  accounts?: number;
  hold?: string;
  outcome?: string | null;
  reason?: string;
  dispute_id?: string;
}
export interface DealTimeline extends DealRow {
  events: DealEvent[];
}

/** System Health (ADR-072): counts and timings only, Super Admin. */
export type HealthWindow = '1h' | '24h' | '7d';
export type HealthStatus = 'ok' | 'warning' | 'problem';
export interface HealthApi {
  name: string;
  method: string;
  calls: number;
  client_errors: number;
  server_errors: number;
  network_errors: number;
  error_rate: number;
  avg_ms: number;
  max_ms: number;
  slow_calls: number;
  last_call_at: string | null;
}
export interface HealthJob {
  name: string;
  every_seconds: number;
  runs: number;
  failures: number;
  last_started_at: string | null;
  last_ok_at: string | null;
  last_failed_at: string | null;
  last_error: string | null;
  last_duration_ms: number | null;
  state: 'ok' | 'late' | 'failing';
}
export type HealthWarningCode =
  | 'outside_failing'
  | 'server_errors'
  | 'some_errors'
  | 'slow'
  | 'job_failed'
  | 'job_late'
  | 'escrow_messages_failed'
  | 'reconciliation_open'
  | 'database_slow';
export interface HealthWarning {
  level: 'red' | 'amber';
  code: HealthWarningCode;
  name: string | null;
  value: number | string | null;
}
export interface SystemHealth {
  now: string;
  window: HealthWindow;
  status: HealthStatus;
  environment: string;
  api_version: string;
  server_started_at: string;
  database: { ok: boolean; ping_ms: number };
  totals: { calls: number; errors: number; error_rate: number; avg_ms: number };
  series: { at: string; calls: number; errors: number; avg_ms: number }[];
  apis: { own: HealthApi[]; webhook: HealthApi[]; outside: HealthApi[] };
  jobs: HealthJob[];
  queues: { escrow_messages_waiting: number; escrow_messages_failed: number; bank_events_waiting: number; reconciliation_open: number };
  warnings: HealthWarning[];
}

/** Staff bell (ADR-070): work waiting for the signed-in person, read live from the queues. */
export type StaffWorkKind = 'kyc_confirm' | 'kyc_recommend' | 'reversal' | 'fraud' | 'dispute' | 'ops_alert';

/** ADR-074: an operations alert for Super Admins. Counts and references only. */
export type OpsAlertRule =
  | 'customer_sign_in_attack'
  | 'staff_sign_in_attack'
  | 'staff_access_changed'
  | 'emergency_control_used'
  | 'unusual_deal_volume'
  | 'money_at_risk'
  | 'high_fraud_alert'
  | 'webhook_rejected'
  | 'webhook_failing'
  | 'api_failing'
  | 'outside_failing'
  | 'job_failing'
  | 'escrow_stalled';
export type OpsAlertSeverity = 'P1' | 'P2' | 'P3' | 'P4';
export type OpsAlertStatus = 'open' | 'acknowledged' | 'resolved';
export interface OpsAlert {
  id: string;
  ref: string;
  rule: OpsAlertRule;
  severity: OpsAlertSeverity;
  status: OpsAlertStatus;
  subject: string;
  details: Record<string, string | number | string[] | null>;
  occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
  notified_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}
/** ADR-075: the emergency pause (Super Admin only). */
export interface DealPauseRecord {
  id: string;
  started_at: string;
  started_by: string;
  reason: string;
  ended_at: string | null;
  ended_by: string | null;
  end_reason: string | null;
  details: { paused_seconds?: number; payout_windows_extended?: number; funding_windows_extended?: number; queue_turns_extended?: number };
}
export interface DealPauseStatus {
  paused: boolean;
  /** The latest pause (open or ended), or null if deals have never been paused. */
  pause: DealPauseRecord | null;
}
export type SessionsWho = 'customers' | 'staff' | 'everyone';

export interface OpsAlertsPage {
  items: OpsAlert[];
  /** Live (not resolved) alerts by severity. */
  live: Record<OpsAlertSeverity, number>;
}
export interface StaffWorkItem {
  kind: StaffWorkKind;
  id: string;
  ref: string;
  at: string;
  /** Fraud severity or dispute priority; otherwise null. */
  detail: string | null;
  /** Arrived since the person last opened the panel. */
  new: boolean;
}
export interface StaffWorkFeed {
  items: StaffWorkItem[];
  total: number;
  new: number;
  seen_at: string | null;
}

export type KycQueue = 'held' | 'in_didit' | 'decided';
export type KycReviewReason = 'DUPLICATE_IDENTITY' | 'IDENTITY_MISMATCH' | 'CHECKS_INCOMPLETE';
export interface KycRow {
  id: string;
  ref: string;
  customer: string;
  customer_email: string;
  country: 'NG' | 'GB' | 'US';
  status: 'under_review' | 'approved' | 'rejected';
  review_reason: KycReviewReason | null;
  awaiting_second: boolean;
  waiting_since: string;
  decided_at: string | null;
}
export interface KycPage {
  total: number;
  items: KycRow[];
  held: number;
  in_didit: number;
}
export interface KycCaseReview {
  id: string;
  status: 'pending' | 'confirmed' | 'declined';
  reason: string;
  recommended_by: string | null;
  recommended_by_id: string;
  recommended_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}
export interface KycCaseDetail {
  id: string;
  ref: string;
  status: KycRow['status'] | 'pending_documents' | 'expired';
  review_reason: KycReviewReason | null;
  in_didit: boolean;
  country: string;
  country_name: string;
  provider_status: string;
  identity: { legal_name: string | null; date_of_birth: string | null; id_type: string | null; issuing_country: string | null };
  can_approve: boolean;
  customer: { user_id: string; email: string | null; phone: string | null; account_status: string | null };
  same_document_elsewhere: { user_id: string; email: string; account_status: string; check_status: string; name: string | null }[];
  account_identity: { country: string; legal_name: string | null; date_of_birth: string | null }[];
  decision_reason: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  reviews: KycCaseReview[];
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
      call<Me | KeyStep>('POST', '/auth/verify', { challenge_id: challengeId, code }),
    verifyKey: (keyChallengeId: string, credential: Record<string, unknown>) =>
      call<Me>('POST', '/auth/key', { key_challenge_id: keyChallengeId, credential }),
    securityKeys: () => call<SecurityKeyList>('GET', '/me/security-keys'),
    addKeyOptions: () =>
      call<{ key_challenge_id: string; options: Record<string, unknown> }>('POST', '/me/security-keys/options'),
    addKey: (keyChallengeId: string, name: string, credential: Record<string, unknown>) =>
      call<SecurityKey>('POST', '/me/security-keys', { key_challenge_id: keyChallengeId, name, credential }),
    removeKey: (id: string) => call<void>('DELETE', `/me/security-keys/${encodeURIComponent(id)}`),
    removeStaffKeys: (staffId: string, reason: string) =>
      call<{ removed: number }>('POST', `/staff/${encodeURIComponent(staffId)}/security-keys/remove`, { reason }),
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
    listKycCases: (q: { queue: KycQueue; search?: string; offset?: number; limit?: number }) => {
      const p = new URLSearchParams({ queue: q.queue });
      if (q.search) p.set('q', q.search);
      p.set('offset', String(q.offset ?? 0));
      p.set('limit', String(q.limit ?? 50));
      return call<KycPage>('GET', `/kyc/cases?${p.toString()}`);
    },
    kycCase: (id: string) => call<KycCaseDetail>('GET', `/kyc/cases/${encodeURIComponent(id)}`),
    recommendKyc: (id: string, reason: string) => call<void>('POST', `/kyc/cases/${encodeURIComponent(id)}/recommend`, { reason }),
    confirmKyc: (id: string, note?: string) => call<void>('POST', `/kyc/cases/${encodeURIComponent(id)}/confirm`, note ? { note } : {}),
    declineKyc: (id: string, note: string) => call<void>('POST', `/kyc/cases/${encodeURIComponent(id)}/decline`, { note }),
    rejectKyc: (id: string, reason: string) => call<void>('POST', `/kyc/cases/${encodeURIComponent(id)}/reject`, { reason }),
    staffWork: () => call<StaffWorkFeed>('GET', '/notifications'),
    systemHealth: (window: HealthWindow) => call<SystemHealth>('GET', `/system-health?window=${window}`),
    opsAlerts: (which: 'live' | 'all' = 'live') => call<OpsAlertsPage>('GET', `/alerts?which=${which}`),
    dealPauseStatus: () => call<DealPauseStatus>('GET', '/emergency/deals'),
    pauseDeals: (reason: string) => call<DealPauseStatus>('POST', '/emergency/deals/pause', { reason }),
    resumeDeals: (reason: string) => call<DealPauseStatus>('POST', '/emergency/deals/resume', { reason }),
    endSessions: (who: SessionsWho, reason: string) =>
      call<{ customer_sessions: number; staff_sessions: number }>('POST', '/emergency/sessions/end', { who, reason }),
    acknowledgeAlert: (id: string) => call<OpsAlert>('POST', `/alerts/${encodeURIComponent(id)}/acknowledge`),
    resolveAlert: (id: string, note: string) => call<OpsAlert>('POST', `/alerts/${encodeURIComponent(id)}/resolve`, { note }),
    customerActivity: (id: string, q: { category?: ActivityCategory; since?: string; until?: string; offset?: number; limit?: number }) => {
      const p = new URLSearchParams();
      if (q.category) p.set('category', q.category);
      if (q.since) p.set('since', q.since);
      if (q.until) p.set('until', q.until);
      p.set('offset', String(q.offset ?? 0));
      p.set('limit', String(q.limit ?? 50));
      return call<CustomerActivityPage>('GET', `/users/${encodeURIComponent(id)}/activity?${p.toString()}`);
    },
    listDeals: (q: { search?: string; offset?: number; limit?: number }) => {
      const p = new URLSearchParams();
      if (q.search) p.set('q', q.search);
      p.set('offset', String(q.offset ?? 0));
      p.set('limit', String(q.limit ?? 50));
      return call<{ total: number; items: DealRow[] }>('GET', `/deals?${p.toString()}`);
    },
    deal: (id: string) => call<DealTimeline>('GET', `/deals/${encodeURIComponent(id)}`),
    staffWorkSeen: () => call<void>('POST', '/notifications/seen'),
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
