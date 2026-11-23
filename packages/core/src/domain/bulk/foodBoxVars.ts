import { ENDPOINTS } from '../../http/endpoints';
import { http } from '../../http/httpClient';

export interface FoodBoxVars {
  /** Max total items a customer can pack into one box. */
  limit: number;
  /** Per-box packaging & customization charge — a distinct bill line for
   * `customSnackbox` orders (ported from MealaweUserApp's
   * `bulk-order-cart.component.ts` `calculateSnackBoxPackagingCost`), not
   * present for regular meals/snacks bulk orders. */
  packagingCost: number;
}

const DEFAULTS: FoodBoxVars = { limit: 10, packagingCost: 15 };

/** Food Box builder config (`FOOD_BOX_LIMIT` / `FOOD_BOX_PACKAGING_COST`) —
 * same `getVariables`-shape call as `supportApi.getSupportContacts`. Falls
 * back to the reference apps' own hardcoded defaults on any failure. */
export async function loadFoodBoxVars(): Promise<FoodBoxVars> {
  try {
    const res = await http.post<Array<{ configName: string; configData: string }>>(
      ENDPOINTS.support.variables,
      { variableNames: ['FOOD_BOX_LIMIT', 'FOOD_BOX_PACKAGING_COST'] },
    );
    const map: Record<string, string> = {};
    for (const row of Array.isArray(res) ? res : []) {
      if (row?.configName) map[row.configName] = row.configData;
    }
    const limit = Number(map.FOOD_BOX_LIMIT);
    const packagingCost = Number(map.FOOD_BOX_PACKAGING_COST);
    return {
      limit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULTS.limit,
      packagingCost: Number.isFinite(packagingCost) && packagingCost >= 0 ? packagingCost : DEFAULTS.packagingCost,
    };
  } catch {
    return DEFAULTS;
  }
}
