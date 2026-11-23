import Image from 'next/image';

import type { CategoryImageSource } from '@mealawe/core';

import { cn } from '@/lib/cn';
import { canOptimizeImage } from '@/lib/image-hosts';

/** Resolves backend image sources. Numeric sources are RN `require()` ids (mobile-only) → none on web. */
export function imgUri(src: CategoryImageSource | string | undefined | null): string | undefined {
  if (!src) return undefined;
  if (typeof src === 'string') return src;
  return typeof src === 'object' && 'uri' in src ? src.uri : undefined;
}

interface ImgProps {
  src?: string;
  alt: string;
  /** Sizing/shape of the box (h-*, w-*, size-*, rounded-*, aspect-*). The image fills it with object-cover. */
  className?: string;
  /** Extra classes for the <img> itself, e.g. `object-left`. */
  imgClassName?: string;
  /**
   * Rendered width of the box, so the optimizer picks a small enough variant: a fixed size for thumbnails
   * ("80px"), a media query list for grid cards. Required on purpose — the default (100vw) would download
   * full-width images for 80px thumbnails.
   */
  sizes?: string;
  /** Lazy-load (long lists). Eager by default: lazy product images stayed blank in some browsers even in view. */
  lazy?: boolean;
  /** Above-the-fold hero/LCP image: fetch it before other images. */
  highPriority?: boolean;
}

/**
 * Remote backend image via next/image (resized, WebP, cached by `/_next/image`). Hosts not on the allowlist
 * (see lib/image-hosts.ts) and blob: previews are loaded directly. Falls back to a tinted block with no source.
 */
export function Img({ src, alt, className, imgClassName, sizes, lazy = false, highPriority = false }: ImgProps) {
  if (!src) return <div aria-hidden className={cn('bg-muted', className)} />;
  return (
    <span className={cn('relative block overflow-hidden bg-muted', className)}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        loading={lazy ? 'lazy' : 'eager'}
        fetchPriority={highPriority ? 'high' : undefined}
        unoptimized={!canOptimizeImage(src)}
        className={cn('object-cover', imgClassName)}
      />
    </span>
  );
}
