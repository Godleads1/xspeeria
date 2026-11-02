'use client';

/**
 * Super Admin security keys (ADR-051 Decision 2, ADR-081): the list, add a key, remove one.
 * Shown on My Profile › Password, and alone on the key-setup screen when a key is required
 * but none is added yet.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { messageFor, type AdminApi, type SecurityKeyList } from '../lib/api';
import { tr } from '../lib/i18n';
import { KeyError, createKey } from '../lib/webauthn';
import { color } from '../theme';
import { Button, FormError, TextInput } from './forms';

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : tr('Never');
}

export function SecurityKeys({
  api,
  onAdded,
}: {
  api: AdminApi;
  /** After a key is added (e.g. to reload who is signed in). */
  onAdded?: () => void;
}): ReactElement | null {
  const [list, setList] = useState<SecurityKeyList | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api.securityKeys());
    } catch (e) {
      setError(messageFor(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(): Promise<void> {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const start = await api.addKeyOptions();
      const credential = await createKey(start.options);
      await api.addKey(start.key_challenge_id, name.trim() || tr('Security key'), credential);
      setName('');
      setDone(tr('Security key added. You’ll touch it each time you log in.'));
      await load();
      onAdded?.();
    } catch (e) {
      setError(e instanceof KeyError ? e.message : messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string): Promise<void> {
    setError(null);
    setDone(null);
    try {
      await api.removeKey(id);
      await load();
    } catch (e) {
      setError(messageFor(e));
    }
  }

  if (list === null) return error ? <FormError message={error} /> : null;
  if (!list.can_add && list.keys.length === 0) return null;

  return (
    <section data-testid="security-keys" aria-labelledby="keys-title">
      <h2 id="keys-title" style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>
        {tr('Security keys')}
      </h2>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: color.text.secondary }}>
        {list.required
          ? tr('A Super Admin must touch a hardware security key (such as a YubiKey) after the email code. Add a spare key in case one is lost.')
          : tr('Add a hardware security key (such as a YubiKey). Once added, you touch it after the email code each time you log in.')}
      </p>
      {list.keys.length === 0 ? (
        <p data-testid="no-keys" style={{ margin: '0 0 12px', fontSize: 13 }}>
          {tr('No security key added yet.')}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0 }}>
          {list.keys.map((k) => (
            <li
              key={k.id}
              data-testid="security-key"
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: `1px solid ${color.border.subtle}` }}
            >
              <span style={{ flex: 1 }}>
                <strong style={{ fontWeight: 600 }}>{k.name}</strong>
                <span style={{ display: 'block', fontSize: 12, color: color.text.secondary }}>
                  {tr('Added {{added}} · Last used {{used}}', { added: when(k.created_at), used: when(k.last_used_at) })}
                </span>
              </span>
              <Button variant="secondary" onClick={() => void remove(k.id)} testId={`remove-key-${k.id}`}>
                {tr('Remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {list.can_add ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ flex: '1 1 220px' }}>
            <TextInput
              label={tr('Key name')}
              placeholder={tr('e.g. Blue YubiKey')}
              value={name}
              onChange={setName}
              required={false}
              testId="key-name"
            />
          </div>
          <Button onClick={() => void add()} busy={busy} testId="add-key">
            {tr('Add security key')}
          </Button>
        </div>
      ) : null}
      <FormError message={error} />
      {done ? (
        <p role="status" data-testid="key-done" style={{ margin: '8px 0 0', fontSize: 13, color: color.text.secondary }}>
          {done}
        </p>
      ) : null}
    </section>
  );
}
