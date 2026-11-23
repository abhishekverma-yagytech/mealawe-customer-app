import { useEffect, useRef, useState } from 'react';

import { loadBulkMenu } from '@mealawe/api';
import type { BulkCategory } from '@mealawe/core';

/** Real (never fabricated) item count + org-wide MOQ for one bulk category,
 * read straight off its "individual" menu response. */
export interface BulkCategorySummary {
  itemCount: number;
  moq: number;
}

const CATEGORIES: BulkCategory[] = ['meals', 'snacks', 'foodbox'];

/**
 * Item count + MOQ per bulk category, for the home teaser's category tiles.
 * Both numbers live on the same `BulkMenuResponse` (`itemList.length` /
 * `moq`) that `bulk-menu.tsx` already fetches via `loadBulkMenu` — this hook
 * makes that same "individual" packaging call for all three categories, in
 * parallel, once `enabled` (the Bulk tab has been visited).
 *
 * A category is simply absent from the result on fetch failure — callers
 * should omit that tile's line rather than show a stale/fabricated number.
 */
export function useBulkCategorySummaries(enabled: boolean): Partial<Record<BulkCategory, BulkCategorySummary>> {
  const [summaries, setSummaries] = useState<Partial<Record<BulkCategory, BulkCategorySummary>>>({});
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;
    let active = true;

    Promise.all(CATEGORIES.map((category) => loadBulkMenu(category, 'individual'))).then((results) => {
      if (!active) return;
      const next: Partial<Record<BulkCategory, BulkCategorySummary>> = {};
      results.forEach((menu, index) => {
        if (menu) {
          next[CATEGORIES[index]] = { itemCount: menu.itemList.length, moq: menu.moq };
        }
      });
      setSummaries(next);
    });

    return () => {
      active = false;
    };
  }, [enabled]);

  return summaries;
}
