import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The workspace packages ship TypeScript source (main: src/index.ts).
  transpilePackages: ['@mealawe/core', '@mealawe/api', '@mealawe/state', '@mealawe/hooks', '@mealawe/design-tokens'],
  images: {
    // Backend images come from the API host / CloudFront; relax per-env in production.
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
