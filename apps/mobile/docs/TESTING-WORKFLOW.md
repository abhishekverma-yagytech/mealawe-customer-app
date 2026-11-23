# Testing workflow — MealaweUserAppRN

This project has **no unit tests** (see `CLAUDE.md`). Test coverage is E2E-only,
via [Maestro](https://maestro.mobile.dev/) flows plus a scenario-level test-case
catalogue tracked as an Excel workbook. This doc is the standing convention for
keeping both up to date as the app grows — read it before adding or changing any
feature.

## Whenever a feature is added or changed

1. **Author or update its Maestro flow(s)** in `.maestro/flows/*.yaml`.
   - See `.maestro/README.md` for setup, selector conventions, and the list of
     existing flows.
   - There are **no `testID` props anywhere in this codebase** — select by
     visible text or `accessibilityLabel` (Maestro matches both the same way on
     Android, since a label is exposed as `contentDescription`).
   - Avoid dynamic strings (prices, dates, countdown timers, per-item rows,
     greetings) as `tapOn`/`assertVisible` targets — target a static sibling
     label instead, or use a regex assertion.
   - Prefer a release build (`npx expo run:android --variant release`) for
     Maestro runs — the debug/dev-client build's "Development Servers" launcher
     screen breaks `launchApp` (see `.maestro/README.md` for the full note).

2. **Add or update its rows in the test-case catalogue**, `scripts/generate-test-catalogue.mjs`:
   - Each feature area has its own array in `FEATURE_SHEETS` (e.g. `Bulk`,
     `Auth`, `Cart`). Add new rows there for feature-level test cases.
   - If the change affects a full user journey (not just one screen), also add
     a row to `FULL_FLOW` (the `E2E-xx` list) and reference the covering
     `.maestro/flows/*.yaml` file in its last column.
   - ID convention: `<AREA-PREFIX>-<NN>` for feature sheets (e.g. `BULK-06`),
     `E2E-<NN>` for the full-flow sheet. Keep numbering sequential within each
     area — don't reuse or renumber existing IDs.
   - Columns: ID / Feature-Area / Title / Preconditions / Steps / Expected
     Result / Priority (`P0`/`P1`/`P2`) [/ Maestro flow, full-flow sheet only].

3. **Regenerate the workbook**: `docs/TEST-CATALOGUE.xlsx` is generated, not
   hand-edited. `exceljs` is not a project dependency (kept out of the app
   bundle) — install it ad hoc before running:
   ```bash
   npm install --no-save exceljs
   node scripts/generate-test-catalogue.mjs
   ```
   The Summary sheet's counts are computed automatically from the feature
   arrays — no manual bookkeeping needed there.

## Priority meaning (and what the colors mean)

- **P0** — blocks release if broken. Rendered with a light red/pink fill
  (`FFFDE9E9`) in the xlsx so these rows are visually scannable at a glance.
- **P1** — high-value regression guard. Unstyled.
- **P2** — nice-to-have / edge case. Unstyled.

## Placeholder / unimplemented features

`marketplace`, `oyo`, `payments` under `src/features/` are
`.gitkeep`-only placeholders with no implementation. They are **explicitly
excluded** from the catalogue and from `.maestro/flows/` until real code exists
— don't invent test cases for a feature that isn't built yet. When one of these
verticals is implemented, its flows and catalogue rows should be authored
alongside that implementation PR, following this same convention.
(`marketplace` has a home shortcuts-row entry point as of the Navmool-shortcut
work — see the `Home` sheet's HOME-05..07 — but its own feature folder is still
a placeholder until the browse/catalog sub-project lands. The Daily/Advance
shortcuts now open a real `on-demand` vertical — see the `OnDemand` sheet — not
a placeholder. `dine-in` has since shipped — see the `Dine In` sheet and
`dine-in-package-cart.yaml` — and was removed from the excluded list.)

## Auth-gated flows

Every flow past the login screen (subscribe, cart, addresses, profile, orders,
wallet, bulk, support) needs a real authenticated session, which needs phone +
OTP verification against the live backend. **No staging test account with a
fixed/predictable OTP exists yet** — those flows are authored with placeholder
values and marked `# MANUAL` in their YAML. They are not CI-runnable until a
real test account is set up (see `.maestro/README.md` for the current status of
each flow).
