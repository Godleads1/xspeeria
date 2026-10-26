'use client';

/**
 * Staff log-in (ADR-051 Decision 1, ADR-060), after the Figma "Xspeeria Login" frames:
 * email and password, then "Two-Factor Authentication" with the code sent to the staff
 * email. The code step can't be skipped.
 */

import { useState, type ReactElement } from 'react';

import { adminApi, messageFor, type AdminApi } from '../../lib/api';
import { color } from '../../theme';
import { Button, Form, FormError, Notice, TextInput } from '../forms';
import { AuthLayout, linkGreen } from './AuthLayout';

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

  if (challenge === null) {
    return (
      <AuthLayout title="Welcome back! Kindly enter your details to proceed">
        <Form label="Log in" onSubmit={() => void submitPassword()}>
          <Notice message={notice} />
          <TextInput
            label="Email Address"
            type="email"
            autoComplete="username"
            inputMode="email"
            placeholder="enter email address"
            value={email}
            onChange={setEmail}
            testId="login-email"
          />
          <TextInput
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="enter password"
            value={password}
            onChange={setPassword}
            testId="login-password"
          />
          <a href="/set-password" style={linkGreen}>
            FORGOT PASSWORD ?
          </a>
          <FormError message={error} />
          <div style={{ height: 40 }} />
          <Button type="submit" busy={busy} block testId="login-submit">
            Login
          </Button>
        </Form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Two-Factor Authentication">
      <Form label="Email code" onSubmit={() => void submitCode()}>
        <p style={{ margin: 0, color: color.text.secondary }}>
          Enter the code you received via email at {challenge.email}. It works for 10 minutes.
        </p>
        <TextInput
          label="Code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6-digit code"
          maxLength={6}
          value={code}
          onChange={(v) => setCode(v.replace(/\D/g, ''))}
          testId="login-code"
        />
        <FormError message={error} />
        <Button type="submit" busy={busy} block testId="login-verify">
          Verify
        </Button>
        <button
          type="button"
          onClick={() => {
            setChallenge(null);
            setCode('');
            setError(null);
          }}
          style={{ ...linkGreen, alignSelf: 'center', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          START AGAIN
        </button>
      </Form>
    </AuthLayout>
  );
}
