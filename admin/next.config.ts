import type { NextConfig } from 'next';

/**
 * Baseline security headers for the admin console (SEC-14, ASVS V14.4). The CSP below holds
 * only directives that do not depend on how Next injects its scripts; a full script-src
 * policy with nonces is added with the first real admin page (it needs middleware).
 */
const SECURITY_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

/**
 * ADR-060: the browser calls `/api/v1/admin/...` on the console's own address and this
 * server forwards it to the Xspeeria API, so the httpOnly session cookie stays same-site and
 * no cross-site access (CORS) is opened. Only the admin routes are forwarded.
 * `ADMIN_API_ORIGIN` is read on the console server (never sent to the browser).
 */
const API_ORIGIN = (process.env.ADMIN_API_ORIGIN ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The shared token package ships TypeScript source, so Next must compile it.
  transpilePackages: ['@xspeeria/tokens'],
  async rewrites() {
    return [{ source: '/api/v1/admin/:path*', destination: `${API_ORIGIN}/api/v1/admin/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
