# Features

Feature-first organization (high cohesion, low coupling). Each domain owns its
components, hooks, services, and types. **Routing lives in `src/app/`**
(Expo Router, file-based); feature folders hold the logic/UI those routes render.

## Domain map (mirrors the Ionic app's 7 verticals + shared)

| Folder | Ionic screens it replaces |
|---|---|
| `auth/` | welcome, mobile-registry (OTP), choose-fav-cuisine, logout |
| `location/` | set-geolocation, search-location(+manual), my-address, save-address, no-service |
| `home/` | tab-home, tabs shell, search, categories, sliders, offers |
| `on-demand/` | tab-on-demand, kitchen(+inside/card/filters), food-items, item-options |
| `subscription/` | tabSubscription, subscription-items, mealpackage-order |
| `dine-in/` | tab-dine-in, dine-in-cart, order-details-dine-in — **RN reimagines this as table booking** (kitchen list → date/meal-slot/party-size → reserve), not the Ionic apps' subscription-package-with-a-flag pattern |
| `bulk/` | tab-bulk, tab-apartment, apartment-inside/cart, cluster-menu |
| `marketplace/` | tabMarketPlace, market-place-category/item/cart |
| `oyo/` | oyo-hotels, oyo-hotel-inside, oyo-hotel-cart |
| `cart/` | tabCart + per-vertical carts, order-confirm, order-placed |
| `orders/` | tabOrder, my-orders, order-details variants, track-open-order |
| `profile/` | tabAccount, my-account, my-wallet, favourites, feedback |
| `payments/` | JusPay HyperSDK + Paytm AllInOne integration |

## Suggested layout per feature

```
features/<domain>/
  components/     # presentational + container components
  hooks/          # feature-scoped hooks
  services/       # API calls (use src/services/http + endpoints)
  types.ts        # feature models
  index.ts        # public surface
```

Migrate one vertical end-to-end (start with **on-demand**) to lock the pattern,
then fan out. See `docs/react-native-migration-analysis.md` in the Ionic repo.
