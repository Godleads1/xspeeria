/** ADR-077: every console page gets a script policy with a fresh nonce. */

import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { contentSecurityPolicy, proxy } from '../proxy';

describe('content security policy', () => {
  it('allows only scripts carrying this page’s nonce', () => {
    const p = contentSecurityPolicy('abc123', false);
    expect(p).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(p).not.toContain('unsafe-inline');
    expect(p).not.toContain('unsafe-eval');
    for (const d of ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'", "form-action 'self'"]) expect(p).toContain(d);
  });

  it('adds unsafe-eval in development only', () => {
    expect(contentSecurityPolicy('n', true)).toContain("'unsafe-eval'");
  });

  it('sends a different nonce on every page, and gives it to the renderer', () => {
    const a = proxy(new NextRequest('http://console.test/disputes'));
    const b = proxy(new NextRequest('http://console.test/disputes'));
    const pa = a.headers.get('Content-Security-Policy') ?? '';
    const pb = b.headers.get('Content-Security-Policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(pa)?.[1];
    expect(nonce).toBeTruthy();
    expect(pa).not.toBe(pb);
    // The page renderer reads the nonce from the forwarded request headers.
    expect(a.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
  });
});
