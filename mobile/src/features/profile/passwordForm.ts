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
  if (f.oldPassword === '') e.oldPassword = 'Enter your current password';
  if (f.newPassword === '') e.newPassword = 'Enter a new password';
  else if (f.newPassword === f.oldPassword) e.newPassword = 'Choose a password different from your current one';
  if (f.confirmPassword === '') e.confirmPassword = 'Confirm your new password';
  else if (f.newPassword !== '' && f.confirmPassword !== f.newPassword) e.confirmPassword = 'Passwords do not match';
  return e;
}
