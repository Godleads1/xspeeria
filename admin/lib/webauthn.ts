/**
 * Security keys in the browser (ADR-081): WebAuthn without a library.
 *
 * The server sends WebAuthn options as JSON with base64url fields; the browser API wants
 * ArrayBuffers. These helpers convert both ways, call `navigator.credentials`, and turn the
 * browser's errors into words for the person. Only the public key ever leaves the key.
 */

import { tr } from './i18n';

type Json = Record<string, unknown>;

export class KeyError extends Error {}

function fromB64u(text: string): ArrayBuffer {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

function toB64u(buf: ArrayBuffer | null): string | null {
  if (buf === null) return null;
  const bytes = new Uint8Array(buf);
  let raw = '';
  for (let i = 0; i < bytes.length; i += 1) raw += String.fromCharCode(bytes[i]);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function descriptors(list: unknown): PublicKeyCredentialDescriptor[] {
  return Array.isArray(list)
    ? list.map((c: Json) => ({
        type: 'public-key' as const,
        id: fromB64u(String(c.id)),
        ...(Array.isArray(c.transports) ? { transports: c.transports as AuthenticatorTransport[] } : {}),
      }))
    : [];
}

export function supported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;
}

function explain(e: unknown): KeyError {
  const name = e instanceof Error ? e.name : '';
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return new KeyError(tr('The security key wasn’t used in time, or the request was cancelled. Please try again.'));
  }
  if (name === 'InvalidStateError') return new KeyError(tr('That security key is already added.'));
  if (name === 'SecurityError') {
    return new KeyError(tr('Security keys only work on the console’s own web address.'));
  }
  return new KeyError(tr('The security key didn’t respond. Please try again.'));
}

function unsupported(): KeyError {
  return new KeyError(tr('This browser can’t use security keys. Use a recent Chrome, Edge, Firefox or Safari.'));
}

/** `navigator.credentials.create` for the server's registration options. */
export async function createKey(options: Json): Promise<Json> {
  if (!supported()) throw unsupported();
  const user = options.user as Json;
  const publicKey: PublicKeyCredentialCreationOptions = {
    ...(options as unknown as PublicKeyCredentialCreationOptions),
    challenge: fromB64u(String(options.challenge)),
    user: { ...(user as unknown as PublicKeyCredentialUserEntity), id: fromB64u(String(user.id)) },
    excludeCredentials: descriptors(options.excludeCredentials),
  };
  let cred: PublicKeyCredential;
  try {
    cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
  } catch (e) {
    throw explain(e);
  }
  const r = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: toB64u(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: toB64u(r.clientDataJSON),
      attestationObject: toB64u(r.attestationObject),
      transports: typeof r.getTransports === 'function' ? r.getTransports() : [],
    },
    authenticatorAttachment: cred.authenticatorAttachment ?? null,
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}

/** `navigator.credentials.get` for the server's log-in options (one touch of the key). */
export async function signWithKey(options: Json): Promise<Json> {
  if (!supported()) throw unsupported();
  const publicKey: PublicKeyCredentialRequestOptions = {
    ...(options as unknown as PublicKeyCredentialRequestOptions),
    challenge: fromB64u(String(options.challenge)),
    allowCredentials: descriptors(options.allowCredentials),
  };
  let cred: PublicKeyCredential;
  try {
    cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
  } catch (e) {
    throw explain(e);
  }
  const r = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: toB64u(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: toB64u(r.clientDataJSON),
      authenticatorData: toB64u(r.authenticatorData),
      signature: toB64u(r.signature),
      userHandle: toB64u(r.userHandle),
    },
    authenticatorAttachment: cred.authenticatorAttachment ?? null,
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}

export const _forTests = { fromB64u, toB64u };
