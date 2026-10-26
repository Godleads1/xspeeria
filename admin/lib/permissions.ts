/**
 * Permission names, shown as words. Mirrors `backend/app/domain/staff_rules.py` (ADR-060).
 *
 * Display only: the server checks every permission on every call. Hiding a button here is a
 * convenience, never the control.
 */

import { tr } from './i18n';

export const MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'users', label: 'Users' },
  { id: 'kyc', label: 'Identity checks (KYC)' },
  { id: 'disputes', label: 'Disputes and support' },
  { id: 'reversals', label: 'Reversals' },
  { id: 'fraud_alerts', label: 'Fraud alerts' },
  { id: 'outages', label: 'Service outages' },
  { id: 'staff', label: 'Staff' },
  { id: 'roles', label: 'Roles' },
  { id: 'audit', label: 'Audit log' },
] as const;

export const ACTIONS = [
  { id: 'read', label: 'Read' },
  { id: 'create', label: 'Create' },
  { id: 'update', label: 'Update' },
  { id: 'delete', label: 'Delete' },
  { id: 'approve', label: 'Approve' },
] as const;

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  compliance_officer: 'Compliance officer',
  ops_admin: 'Operations admin',
  support_agent: 'Support agent',
};

export function roleLabel(name: string): string {
  // Built-in roles have translated names; custom roles show the name they were given.
  const known = ROLE_LABELS[name];
  return known ? tr(known) : name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Audit log action names, in words. Unknown ones are shown as they are. */
export const ACTION_LABELS: Record<string, string> = {
  login: 'Logged in',
  login_code_sent: 'Password correct, email code sent',
  login_failed: 'Log-in failed',
  login_locked: 'Locked after wrong passwords',
  logout: 'Logged out',
  password_code_sent: 'Password code sent',
  password_set: 'Set first password',
  password_reset: 'Reset password',
  password_changed: 'Changed password',
  password_change_failed: 'Password change failed',
  staff_created: 'Invited staff',
  staff_updated: 'Changed staff',
  role_created: 'Created role',
  role_updated: 'Changed role',
  role_deleted: 'Deleted role',
  first_super_admin_created: 'First Super Admin created',
  photo_set: 'Set a photo',
  photo_removed: 'Removed a photo',
  profile_updated: 'Changed own name or phone',
  customer_suspended: 'Suspended a customer',
  customer_reactivated: 'Lifted a customer suspension',
  customer_closed: 'Closed a customer account',
};

export function actionLabel(action: string): string {
  const known = ACTION_LABELS[action];
  return known ? tr(known) : action;
}
