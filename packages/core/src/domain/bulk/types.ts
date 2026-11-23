export type BulkCategory = 'meals' | 'snacks' | 'foodbox';
export type BulkPackaging = 'individual' | 'bulk';

/** The backend's `orderType` string for a bulk order — see `bulkOrderType()`
 * in `api.ts` for the category × packaging mapping. */
export type BulkOrderType =
  | 'individualMeals'
  | 'bulkMeals'
  | 'individualSnacks'
  | 'bulkSnacks'
  | 'predefinedSnackbox'
  | 'customSnackbox';

/**
 * Org-level bulk config for a menu (shared by every item in that menu response).
 * Ported from MealaweUserApp's `b2BMenuOrgInfo` / locally-built `bulkMealOrgInfo`.
 */
export interface BulkOrgInfo {
  moq: number;
  slabLimit1: number;
  slabLimit2: number;
  slabLimit3: number;
  dateLimit1: number;
  dateLimit2: number;
  dateLimit3: number;
  deliverySlab1: number;
  deliverySlab2: number;
  deliverySlab3: number;
  deliverySlab4: number;
  packagingCharges: number;
  platformCharges: number;
}

export interface BulkMenuItem {
  _id: string;
  itemName: string;
  itemImage?: string;
  /** True for both 'Veg' and 'Jain' `itemType` — Jain is a stricter
   * vegetarian subtype, never non-veg. Use `itemType` directly (see
   * `ItemDietMark`) wherever Jain needs its own distinct treatment. */
  isVeg: boolean;
  itemType: 'Veg' | 'NonVeg' | 'Jain';
  /** Base (slab-1) price — kept for display before any quantity is chosen. */
  itemPrice: number;
  slab1Price: number;
  slab2Price: number;
  slab3Price: number;
  slab4Price: number;
  /** Short item description, if the backend has one configured — mirrors
   * MealaweUserApp/mealaweApp's `itemDescription`. Absent for most items. */
  itemDescription?: string;
  /** Section name for the Food Box item picker (e.g. "Starters", "Mains").
   * Absent for regular meals/snacks items — the box builder falls back to
   * grouping by veg/non-veg when this isn't present. */
  group?: string;
}

/** A menu API response: org config + its item list. */
export interface BulkMenuResponse extends BulkOrgInfo {
  itemList: BulkMenuItem[];
}

/** One line in the bulk cart. `itemPrice`/`deliveryDateCount` are the resolved
 * slab-tier values for the line's current `count` (see `pricing.ts`). */
export interface BulkCartLine {
  item: BulkMenuItem;
  count: number;
  itemPrice: number;
  deliveryDateCount: number;
}
