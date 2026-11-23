import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';

import { IMAGE_ORIGINS } from './src/lib/image-hosts';

const nextConfig: NextConfig = {
  // The workspace packages ship TypeScript source (main: src/index.ts).
  transpilePackages: ['@mealawe/core', '@mealawe/api', '@mealawe/state', '@mealawe/hooks', '@mealawe/design-tokens'],
  images: {
    // Only the API host and NEXT_PUBLIC_IMAGE_HOSTS are optimized (an open `**` pattern would let anyone use
    // /_next/image as a free image proxy). <Img> loads any other host directly instead of hitting a 400.
    remotePatterns: IMAGE_ORIGINS.map((o) => ({
      protocol: o.protocol.replace(':', '') as 'http' | 'https',
      hostname: o.hostname,
      port: o.port,
      pathname: '/**',
    })),
    // Backend images rarely send long cache headers; keep optimized variants for a day (default is 4 hours).
    minimumCacheTTL: 86400,
  },
  experimental: {
    // Tailwind CSS is small (~9 kB gzip): ship it as a <style> in the HTML instead of a render-blocking <link>
    // (Lighthouse "Render-blocking requests"). Trade-off: returning visitors re-download it with each HTML page.
    inlineCss: true,
  },
};

// `npm run analyze` (webpack build) or ANALYZE=true writes treemaps to .next/analyze/{client,nodejs,edge}.html.
// @next/bundle-analyzer is webpack-only; for the default Turbopack build use `npm run analyze:turbo` (next analyze).
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true' || process.env.npm_lifecycle_event === 'analyze',
  openAnalyzer: false,
});

export default withBundleAnalyzer(nextConfig);
