import type { CategoryImageSource } from '@mealawe/core';

import { cn } from '@/lib/cn';

/** Resolves backend image sources. Numeric sources are RN `require()` ids (mobile-only) → none on web. */
export function imgUri(src: CategoryImageSource | string | undefined | null): string | undefined {
  if (!src) return undefined;
  if (typeof src === 'string') return src;
  return typeof src === 'object' && 'uri' in src ? src.uri : undefined;
}

/**
 * Plain <img> for remote backend images. Eager by default: `loading="lazy"` left product images blank
 * (never requested) in some browsers even when in view, and our lists are short. Pass `lazy` for long lists.
 * Falls back to a tinted block when there is no source.
 */
export function Img({ src, alt, className, lazy = false }: { src?: string; alt: string; className?: string; lazy?: boolean }) {
  if (!src) return <div aria-hidden className={cn('bg-muted', className)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading={lazy ? 'lazy' : 'eager'} decoding="async" className={cn('object-cover', className)} />;
}
