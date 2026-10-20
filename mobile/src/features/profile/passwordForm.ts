import { tr } from "../../i18n";

/**
 * Client-side checks for Change Password (ADR-007 A6). Only checks that do not depend on
 * the password policy: required fields, confirmation match, new differs from old.
 * Length/complexity/reuse rules are Open Decision 2 and are enforced by the server once
 * decided; nothing here may become that policy by default.
 */

export interface PasswordForm {
  readonly oldPassword: string;
  readonly newPassword: string;
  readonly confirmPassword: string;
}

export type PasswordField = keyof PasswordForm;

export function validatePasswordForm(f: PasswordForm): Partial<Record<PasswordField, string>> {
  const e: Partial<Record<PasswordField, string>> = {};
  if (f.oldPassword === '') e.oldPassword = tr("Enter your current password");
  if (f.newPassword === '') e.newPassword = tr("Enter a new password");
  else if (f.newPassword === f.oldPassword) e.newPassword = tr("Choose a password different from your current one");
  if (f.confirmPassword === '') e.confirmPassword = tr("Confirm your new password");
  else if (f.newPassword !== '' && f.confirmPassword !== f.newPassword) e.confirmPassword = tr("Passwords do not match");
  return e;
}
