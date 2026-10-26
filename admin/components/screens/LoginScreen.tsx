'use client';

/**
 * Staff log-in (ADR-051 Decision 1, ADR-060): email and password, then the 6-digit code sent
 * to the staff email. The code step can't be skipped.
 */

import { useState, type ReactElement } from 'react';

import { adminApi, messageFor, type AdminApi } from '../../lib/api';
import { color, space } from '../../theme';
import { Button, Form, FormError, Notice, TextInput } from '../forms';

export function LoginScreen({
  onSignedIn,
  api = adminApi,
  notice = null,
}: {
  onSignedIn: () => void;
  api?: AdminApi;
  /** e.g. "Your password is set. Log in." */
  notice?: string | null;
}): ReactElement {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<{ id: string; email: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitPassword(): Promise<void> {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.login(email.trim(), password);
      setChallenge({ id: r.challenge_id, email: r.email });
      setPassword('');
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(): Promise<void> {
    if (!challenge) return;
    if (!/^[0-9]{6}$/.test(code)) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.verify(challenge.id, code);
      onSignedIn();
    } catch (e) {
      setError(messageFor(e));
      setBusy(false);
    }
  }

  return (
    <div style={page}>
      <div style={card}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Xspeeria Admin</h1>
        {challenge === null ? (
          <Form label="Log in" onSubmit={() => void submitPassword()}>
            <p style={{ margin: 0, color: color.text.secondary }}>Log in with your staff account.</p>
            <Notice message={notice} />
            <TextInput
              label="Email"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={setEmail}
              testId="login-email"
            />
            <TextInput
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              testId="login-password"
            />
            <FormError message={error} />
            <Button type="submit" busy={busy} testId="login-submit">
              Continue
            </Button>
            <a href="/set-password" style={{ color: color.brand.secondaryText, fontSize: 14 }}>
              Forgot your password, or setting it for the first time?
            </a>
          </Form>
        ) : (
          <Form label="Email code" onSubmit={() => void submitCode()}>
            <p style={{ margin: 0, color: color.text.secondary }}>
              We sent a 6-digit code to {challenge.email}. It works for 10 minutes.
            </p>
            <TextInput
              label="Code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(v) => setCode(v.replace(/\D/g, ''))}
              testId="login-code"
            />
            <FormError message={error} />
            <Button type="submit" busy={busy} testId="login-verify">
              Log in
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setChallenge(null);
                setCode('');
                setError(null);
              }}
            >
              Start again
            </Button>
          </Form>
        )}
      </div>
    </div>
  );
}

export const page = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: color.bg.sunken,
  padding: space.sm,
} as const;

export const card = {
  width: '100%',
  maxWidth: 420,
  backgroundColor: color.bg.canvas,
  border: `1px solid ${color.border.subtle}`,
  borderRadius: 16,
  padding: space.md,
  display: 'flex',
  flexDirection: 'column',
  gap: space.sm,
} as const;
