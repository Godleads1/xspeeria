'use client';

/**
 * Set a password with an emailed code (ADR-060): for a forgotten password, and for invited
 * staff setting their first one. With an invite link (`?id=`) the code was already emailed;
 * otherwise the person enters their email to get one. The answer is the same whether or
 * not the email belongs to staff.
 */

import { useState, type ReactElement } from 'react';

import { adminApi, messageFor, type AdminApi } from '../../lib/api';
import { color } from '../../theme';
import { Button, Form, FormError, TextInput } from '../forms';
import { AuthLayout, linkGreen } from './AuthLayout';

export const PASSWORD_HINT =
  'At least 12 characters. A few words you will remember works well. Don’t use your email.';

export function SetPasswordScreen({
  inviteId = null,
  onDone,
  api = adminApi,
}: {
  inviteId?: string | null;
  onDone: () => void;
  api?: AdminApi;
}): ReactElement {
  const [email, setEmail] = useState('');
  const [resetId, setResetId] = useState<string | null>(inviteId);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(): Promise<void> {
    if (!email.trim()) {
      setError('Enter your staff email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResetId((await api.forgot(email.trim())).reset_id);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    if (!resetId) return;
    if (!/^[0-9]{6}$/.test(code)) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    if (password.length < 12) {
      setError('Use at least 12 characters.');
      return;
    }
    if (password !== again) {
      setError('The two passwords don’t match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.reset(resetId, code, password);
      onDone();
    } catch (e) {
      setError(messageFor(e));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={
        resetId === null
          ? 'Trouble signing in? Enter your email address and we’ll send you a code to set a new password.'
          : 'Enter your new password'
      }
    >
      {resetId === null ? (
        <Form label="Get a code" onSubmit={() => void sendCode()}>
          <TextInput
            label="Email Address"
            type="email"
            autoComplete="username"
            inputMode="email"
            placeholder="enter email address"
            value={email}
            onChange={setEmail}
            testId="reset-email"
          />
          <FormError message={error} />
          <Button type="submit" busy={busy} block testId="reset-send">
            Send code
          </Button>
        </Form>
      ) : (
        <Form label="New password" onSubmit={() => void save()}>
          <p style={{ margin: 0, color: color.text.secondary }}>
            {inviteId
              ? 'Enter the 6-digit code from your invitation email and choose a password.'
              : 'If that email has a staff account, a 6-digit code is on its way. It works for 30 minutes.'}
          </p>
          <TextInput
            label="Code from the email"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            maxLength={6}
            value={code}
            onChange={(v) => setCode(v.replace(/\D/g, ''))}
            testId="reset-code"
          />
          <TextInput
            label="Enter New Password"
            type="password"
            autoComplete="new-password"
            placeholder="enter new password"
            value={password}
            onChange={setPassword}
            hint={PASSWORD_HINT}
            testId="reset-password"
          />
          <TextInput
            label="Confirm New Password"
            type="password"
            autoComplete="new-password"
            placeholder="enter new password again"
            value={again}
            onChange={setAgain}
            testId="reset-again"
          />
          <FormError message={error} />
          {/* Figma: a clear gap before the main button. */}
          <div style={{ height: 40 }} />
          <Button type="submit" busy={busy} block testId="reset-save">
            Reset Password
          </Button>
        </Form>
      )}
      <a href="/login" style={{ ...linkGreen, alignSelf: 'center' }}>
        BACK TO LOGIN
      </a>
    </AuthLayout>
  );
}
