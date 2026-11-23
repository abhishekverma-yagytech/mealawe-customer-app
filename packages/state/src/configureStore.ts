import { create } from 'zustand';

import { STORAGE_KEYS, kvStorage, type SubscriptionConfig, type MealPackage } from '@mealawe/core';


/** What the Configure screen needs to build a cart line. */
interface ConfigureContext {
  package: MealPackage;
  category: string;
  isDineIn?: boolean;
  /** Meal-time selection made on the Plan screen — a fresh flow's source of
   * truth for Configure's (now read-only, non-editable there) meal-time
   * summary. An existing cart-line edit uses `initial.lunch`/`initial.dinner`
   * instead, which takes priority. */
  lunch?: boolean;
  dinner?: boolean;
  /** Breakfast-category packages use this instead — see `SubscriptionConfig`. */
  breakfast?: boolean;
  /** Existing cart line to prefill (when editing add-ons / schedule). */
  initial?: SubscriptionConfig;
}

interface ConfigureState {
  context: ConfigureContext | null;
  set: (ctx: ConfigureContext) => void;
  clear: () => void;
  /** Restore the hand-off after a page refresh (web). Mobile never needs it; safe no-op if nothing saved. */
  hydrate: () => void;
}

/**
 * Hand-off between the plan grid and the Configure screen — mirrors mealaweApp's
 * ConfigureContextService. Avoids serializing a whole MealPackage through route
 * params. Set it on Subscribe, read it in the configure route, clear on save.
 */
function persist(ctx: ConfigureContext | null): void {
  try {
    if (ctx) kvStorage.setObject(STORAGE_KEYS.configureContext, ctx);
    else kvStorage.remove(STORAGE_KEYS.configureContext);
  } catch {
    // storage unavailable — in-memory hand-off still works
  }
}

export const useConfigureStore = create<ConfigureState>((set) => ({
  context: null,
  set: (context) => {
    persist(context);
    set({ context });
  },
  clear: () => {
    persist(null);
    set({ context: null });
  },
  hydrate: () => {
    try {
      set({ context: kvStorage.getObject<ConfigureContext>(STORAGE_KEYS.configureContext) });
    } catch {
      // ignore
    }
  },
}));
