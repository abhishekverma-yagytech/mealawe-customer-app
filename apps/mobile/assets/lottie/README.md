# Home hero Lottie animations

One background animation per order-mode tab on Home's hero band.

## Naming

`<TabName>Hero.json`, PascalCase — one file per tab:

```
SubscriptionHero.json
BulkHero.json
DineInHero.json
OnDemandHero.json
KotaSubscriptionHero.json   # Kota's Subscription-tab override
```

All of these currently share the same placeholder animation content until
design delivers the real per-tab ones — when a real animation arrives for a
given tab, just overwrite that file's content under its existing name; no
code change needed.

Both formats work:

- **`.lottie`** (dotLottie, preferred — smaller) — bundled via the `lottie`
  asset extension registered in `metro.config.js`.
- **`.json`** (Bodymovin) — also fine.

## Wiring a new file

`require()` paths must be static string literals (Metro can't resolve variables),
so each animation is registered by hand in
[`src/features/home/homeLotties.ts`](../../src/features/home/homeLotties.ts).
Renaming or adding a tab means updating that registry's `require()` path.

Until at least one animation is registered, the home hero renders the brand
gradient fallback — nothing breaks.

> Native module: `lottie-react-native`. Adding/first-using it needs a dev-client
> rebuild (`npx expo prebuild` → `npm run android`). Metro-only reload won't pick
> up the native view.
