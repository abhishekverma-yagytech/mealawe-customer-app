/**
 * Home hero Lottie registry — one slot per order-mode tab.
 *
 * No bundled local fallback anymore — every slot is admin-configured via
 * `HeroLottieConfig` (dashboard-managed, see `useHeroLotties`/`tabThemeFor`).
 * A tab with nothing configured yet shows its gradient tint alone — nothing
 * crashes, see `LottieHero`. The original per-tab animation files
 * (`SubscriptionHero.json`, `BulkHero.json`, `DineInHero.json`,
 * `OnDemandHero.json`, `KotaSubscriptionHero.json` — see
 * `assets/lottie/README.md`) are kept on disk so they can be uploaded
 * through the dashboard's Hero Lottie Config form; once every tab has a
 * real admin-uploaded slide, those files can be deleted too.
 */
/**
 * A Lottie source: a require()'d local asset (`number`), a bundled path
 * (`string`), a remote animation (`{ uri }`), or an inline Bodymovin object.
 * Matches what `lottie-react-native`'s `source` prop accepts.
 */
export type LottieSource = string | number | { uri: string } | Record<string, unknown>;

/** Keyed by `HomeTab.key` (see `tabTheme.ts`). Empty until an admin uploads
 * a slide for that tab via the dashboard's Hero Lottie Config page. */
export const HOME_HERO_LOTTIES: Record<string, LottieSource[]> = {
  subscription: [],
  bulk: [],
  dinein: [],
  ondemand: [],
  apartment_instant: [],
  apartment_today: [],
  apartment_advance: [],
};

/** The order-mode tabs (and, for Apartment, its 3 order-type sub-slots) a
 * hero animation can be configured for — used to fan out one fetch per tab
 * against the dashboard-managed HeroLottieConfig list (see
 * `useHeroLotties`), and kept as an explicit array (rather than re-deriving
 * from `HOME_HERO_LOTTIES` at every call site) since it's also the source of
 * truth for the fetch order. */
export const HOME_TAB_KEYS: readonly string[] = Object.keys(HOME_HERO_LOTTIES);

/**
 * Kota's subscription catalog (Hostel/IIT/Pocket/Bowl/Combo) looks nothing
 * like the Bangalore/Pune thali lineup the default `subscription` hero
 * animation depicts, so Kota gets its own slot here instead — see
 * `lottiesForTab`. No bundled fallback (see
 * `HOME_HERO_LOTTIES`'s doc comment) — configure Kota's override via the
 * dashboard's Hero Lottie Config form using a Kota-scoped cluster config,
 * same as any other cluster-specific slide.
 */
export const KOTA_SUBSCRIPTION_LOTTIES: LottieSource[] = [];

/** Cluster-aware hero lottie lookup — mirrors `categoriesForClusters`'
 * Kota carve-out. Dine In, Bulk, and On Demand are cluster-agnostic today. */
export function lottiesForTab(tabKey: string, isKota: boolean): LottieSource[] {
  if (isKota && tabKey === 'subscription') {
    return KOTA_SUBSCRIPTION_LOTTIES;
  }
  return HOME_HERO_LOTTIES[tabKey] ?? [];
}
