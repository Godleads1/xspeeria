import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The shared token package ships TypeScript source, so Next must compile it.
  transpilePackages: ['@xspeeria/tokens'],
};

export default nextConfig;
