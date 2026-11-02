'use client';

/**
 * Staff log-in (ADR-051 Decision 1, ADR-060), after the Figma "Xspeeria Login" frames:
 * email and password, then "Two-Factor Authentication" with the code sent to the staff
 * email. The code step can't be skipped. ADR-081: a Super Admin with a security key then
 * touches the key.
 */

import { useState, type ReactElement } from 'react';

import { adminApi, messageFor, type AdminApi, type KeyStep } from '../../lib/api';
import { tr } from '../../lib/i18n';
import { KeyError, signWithKey } from '../../lib/webauthn';
import { color } from '../../theme';
import { CodeBoxes } from '../CodeBoxes';
import { Button, Form, FormError, TextInput } from '../forms';
import { Toast } from '../Toast';
import { AuthLayout, linkGreen } from './AuthLayout';

export function LoginScreen({
  onSignedIn,
  api = adminApi,
  passwordChanged = false,
}: {
  onSignedIn: () => void;
  api?: AdminApi;
  /** Just came from setting a new password: show the Figma "Password Changed" toast. */
  passwordChanged?: boolean;
}): ReactElement {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<{ id: string; email: string } | null>(null);
  const [code, setCode] = useState('');
  const [keyStep, setKeyStep] = useState<KeyStep | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitPassword(): Promise<void> {
    if (!email.trim() || !password) {
      setError(tr('Enter your email and password.'));
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
      setError(tr('Enter the 6-digit code from the email.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.verify(challenge.id, code);
      if ('key_required' in r && r.key_required) {
        setKeyStep(r);
        setBusy(false);
        return;
      }
      onSignedIn();
    } catch (e) {
      setError(messageFor(e));
      setBusy(false);
    }
  }

  async function touchKey(): Promise<void> {
    if (!keyStep) return;
    setBusy(true);
    setError(null);
    try {
      const answer = await signWithKey(keyStep.options);
      await api.verifyKey(keyStep.key_challenge_id, answer);
      onSignedIn();
    } catch (e) {
      setBusy(false);
      if (e instanceof KeyError) {
        // Cancelled or timed out in the browser: the same challenge can be tried again.
        setError(e.message);
        return;
      }
      // Refused by the server: this log-in is over (the email code is spent). Start again.
      startAgain();
      setError(messageFor(e));
    }
  }

  function startAgain(): void {
    setChallenge(null);
    setKeyStep(null);
    setCode('');
    setError(null);
  }

  if (keyStep !== null) {
    return (
      <AuthLayout title={tr('Security key')}>
        <Form label={tr('Security key')} onSubmit={() => void touchKey()}>
          <p style={{ margin: 0, color: color.text.secondary }}>
            {tr('Insert your security key and press the button below, then touch the key when it blinks.')}
          </p>
          <FormError message={error} />
          <div style={{ height: 24 }} />
          <Button type="submit" busy={busy} block testId="login-key">
            {tr('Use my security key')}
          </Button>
          <button type="button" onClick={startAgain} style={{ ...linkGreen, alignSelf: 'center', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            {tr('START AGAIN')}
          </button>
        </Form>
      </AuthLayout>
    );
  }

  if (challenge === null) {
    return (
      <AuthLayout title={tr('Welcome back! Kindly enter your details to proceed')}>
        {passwordChanged ? (
          <Toast
            testId="password-changed"
            title={tr('Password Changed')}
            message={tr('Your password reset is successful. Proceed to login with new password.')}
          />
        ) : null}
        <Form label={tr('Log in')} onSubmit={() => void submitPassword()}>
          <TextInput
            label={tr('Email Address')}
            type="email"
            autoComplete="username"
            inputMode="email"
            placeholder={tr('enter email address')}
            value={email}
            onChange={setEmail}
            testId="login-email"
          />
          <TextInput
            label={tr('Password')}
            type="password"
            autoComplete="current-password"
            placeholder={tr('enter password')}
            value={password}
            onChange={setPassword}
            testId="login-password"
          />
          <a href="/set-password" style={linkGreen}>
            {tr('FORGOT PASSWORD ?')}
          </a>
          <FormError message={error} />
          <div style={{ height: 40 }} />
          <Button type="submit" busy={busy} block testId="login-submit">
            {tr('Login')}
          </Button>
        </Form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={tr('Two-Factor Authentication')}>
      <Form label={tr('Email code')} onSubmit={() => void submitCode()}>
        <p style={{ margin: 0, color: color.text.secondary }}>
          {tr('Enter the code you received via email at {{email}}. It works for 10 minutes.', { email: challenge.email })}
        </p>
        <div style={{ height: 24 }} />
        <CodeBoxes value={code} onChange={setCode} testId="login-code" />
        <FormError message={error} />
        <div style={{ height: 24 }} />
        <Button type="submit" busy={busy} block testId="login-verify">
          {tr('Confirm')}
        </Button>
        <button
          type="button"
          onClick={startAgain}
          style={{ ...linkGreen, alignSelf: 'center', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {tr('START AGAIN')}
        </button>
      </Form>
    </AuthLayout>
  );
}
