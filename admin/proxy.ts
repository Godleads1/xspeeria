/**
 * Content-Security-Policy with a fresh nonce on every page (ADR-077; readiness review M-4).
 * Next.js reads the nonce from the request's CSP header and puts it on its own scripts; the
 * root layout puts it on the theme script (ADR-064). With `'strict-dynamic'`, only scripts
 * carrying this request's nonce, or loaded by one, run: an injected `<script>` or an inline
 * event handler does not.
 *
 * Styles stay as they were: the console uses React `style` attributes, which a style nonce
 * can't cover.
 */

import { NextResponse, type NextRequest } from 'next/server';

/** The policy for one page. `'unsafe-eval'` only in development (React's dev error stacks). */
export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join('; ');
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not the API calls forwarded to the server, built files or the icon.
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
