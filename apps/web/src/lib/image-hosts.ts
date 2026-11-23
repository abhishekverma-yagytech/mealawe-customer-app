/**
 * Which remote image hosts go through the Next image optimizer (`/_next/image`). Shared by `next.config.ts`
 * (builds `images.remotePatterns`) and `<Img>` (decides `unoptimized`), so the two can't drift apart.
 *
 * Kept free of `@/` imports because next.config.ts imports it with a relative path. NEXT_PUBLIC_* must be read
 * literally (`process.env.NEXT_PUBLIC_X`) so Next inlines them into the client bundle.
 */

const PRODUCTION_API = 'https://api.mealawe.com';

function toOrigin(entry: string): URL | null {
  const value = entry.trim();
  if (!value) return null;
  try {
    // Bare hostnames ("dxxxx.cloudfront.net") are taken as https.
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
}

/** The API host (backend `/images/...`) plus any extra CDN/S3 hosts from NEXT_PUBLIC_IMAGE_HOSTS (comma-separated). */
export const IMAGE_ORIGINS: readonly URL[] = [
  PRODUCTION_API,
  process.env.NEXT_PUBLIC_API_URL ?? '',
  ...(process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? '').split(','),
]
  .map(toOrigin)
  .filter((u): u is URL => u !== null)
  .filter((u, i, all) => all.findIndex((o) => o.protocol === u.protocol && o.host === u.host) === i);

// The optimizer refuses to fetch from private/loopback addresses (images.dangerouslyAllowLocalIP), so a local
// backend's images must be loaded directly or they would 400.
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i;

/**
 * True when `src` can be served through `/_next/image`: a local `/public` path, or an http(s) URL on an allowed,
 * non-private host. Everything else (blob:/data: previews, unknown hosts) is rendered `unoptimized` — loaded
 * straight from its URL, exactly as before — instead of failing with a 400 from the optimizer.
 */
export function canOptimizeImage(src: string): boolean {
  if (src.startsWith('/') && !src.startsWith('//')) return true;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  if (PRIVATE_HOST.test(url.hostname)) return false;
  return IMAGE_ORIGINS.some((o) => o.protocol === url.protocol && o.host === url.host);
}
