import { getCoreConfig } from '../../runtime';

import type { MealPackage } from './types';

/** Absolute URL for a backend image path, or undefined when missing/placeholder. */
export function imageUri(path?: string): string | undefined {
  if (!path || path === 'undefined') {
    return undefined;
  }
  if (path.startsWith('http')) {
    return path;
  }
  return `${getCoreConfig().serverUrl}/images/${path}`;
}

/** The display image for a package. */
export function packageImageUri(pkg: MealPackage | null | undefined): string | undefined {
  return imageUri(pkg?.imageUrl);
}
