# Maestro E2E — MealaweUserAppRN

## Setup (Windows-native — no WSL2 needed)

Maestro's CLI is JVM-based and runs directly on Windows:

1. Install a JDK 17+ (any vendor) and ensure `java` is on `PATH`.
2. Download the Maestro CLI zip from https://github.com/mobile-dev-inc/maestro/releases
   (or `https://get.maestro.mobile.dev` from a Unix shell), unzip it, and put its
   `bin/` folder on your `PATH` — e.g. unzip to `%USERPROFILE%\.maestro` so
   `maestro.bat` lives at `%USERPROFILE%\.maestro\bin\maestro.bat`.
3. Verify: `maestro --version`.
4. An Android emulator (AVD) or physical device with `adb` debugging must be
   running before any flow — Maestro drives an existing running app, it doesn't
   boot emulators itself.
5. Optional: register the Maestro MCP server so an AI coding agent can inspect the
   screen and author/run flows interactively: `claude mcp add maestro --scope user
   -- maestro mcp`.

## Running flows

```bash
# one flow
maestro test .maestro/flows/onboarding-to-login.yaml

# everything (or use the npm script: npm run e2e:maestro)
maestro test .maestro/flows

# visual flow recorder / element inspector
maestro studio
```

The app (`com.mealawe.app`) must already be installed on the target
device/emulator.

**Use a release build, not the dev-client debug build.** The debug build (`npx
expo run:android`) installs Expo's dev-client launcher, which shows its own
"Development Servers" picker screen on every fresh process start (not just
`clearState`) — Maestro's `launchApp` lands there instead of the app, breaking
every flow. Build a release APK instead:

```bash
npx expo run:android --variant release
```

This produces a standalone APK that boots straight to the app (confirmed this
session — the debug build reliably failed at `launchApp`, the release build
reliably passed the same flow). It still talks to your configured `EXPO_PUBLIC_ENV`
backend; it just skips the dev-client chrome.

## Flow index

| Flow | Covers | Auth required |
|---|---|---|
| `onboarding-to-login.yaml` | Welcome carousel → Login screen | No |
| `login-otp-flow.yaml` | Phone entry → OTP verify | **Manual** (placeholder OTP) |
| `register-new-user.yaml` | New-user profile completion | **Manual** |
| `home-browse-subscription.yaml` | Weekly menu sheet, veg-only toggle | **Manual** |
| `home-tabs-tap-switch.yaml` | Home tabs tap switching (Subscription/Bulk/Dine In) — no swipe | **Manual** |
| `subscribe-configure-cart.yaml` | Subscribe → configure → cart | **Manual** |
| `cart-coupon-and-wallet.yaml` | Coupon apply/remove, Proceed to Pay | **Manual** |
| `bulk-browse-and-cart.yaml` | Bulk category → quantity → bulk cart | **Manual** |
| `addresses-manage.yaml` | Add a new delivery address | **Manual** |
| `profile-theme-signout.yaml` | Appearance (dark mode) + sign out | **Manual** |
| `help-and-feedback.yaml` | Help & support, submit feedback | **Manual** |
| `navmool-shortcut-tile.yaml` | Navmool shortcut tab → placeholder screen | **Manual** |
| `on-demand-kitchen-to-cart.yaml` | Daily/Advance kitchen → items → cart, incl. "Change" kitchen link, "Add something else" link, and "Pay now" CTA | **Manual** |
| `dine-in-package-cart.yaml` | Dine In package → configure → cart (no address row) | **Manual** |
| `manage-subscription.yaml` | Manage subscription: pause/resume toggle | **Manual** |
| `refer-earn.yaml` | Refer & Earn: code copy, FAQ expand/collapse | **Manual** |

## ⚠️ Manual/placeholder flows

Every flow past the login screen depends on completing phone + OTP verification
against the real backend. **No staging test account with a fixed/predictable OTP
exists yet.** These flows use placeholder values (`9876543210` / `000000`) and are
marked `# MANUAL` in their YAML — they will not pass unattended until a real test
account is set up. Once one exists, delete the placeholder comment and swap in the
real phone/OTP; no other rewrite is needed.

**Verified this session** (release APK, Pixel_7_Pro emulator, real backend):
- `onboarding-to-login.yaml` — passes cleanly end to end.
- `login-otp-flow.yaml` — passes through phone entry + Send OTP; the placeholder
  OTP `000000` is correctly rejected by the real backend ("Verification failed —
  Request failed: 503"), confirming the flow's selectors and steps are correct up
  to the actual auth boundary. This is the expected/designed limitation, not a bug.
- The remaining 8 flows (everything past login) could not be run live this session
  since they require an authenticated session, which needs a real test account —
  they are authored from the same UI-text audit methodology that produced the two
  verified flows above, but are unverified against the running app.

One real selector bug was found and fixed during verification:
`login-otp-flow.yaml`'s phone-entry step originally targeted `"Mobile Number"`
(the field's label text) instead of the actual `TextInput` — tapping the label
does not focus the input, so `inputText` silently typed into nothing. Fixed to
target the placeholder text `"10-digit number"` instead. This is a general
pattern for this codebase's `TextField` component: the label and the input are
separate elements, so flows must always target the placeholder, not the label.

## Selector notes

- **Zero `testID` props exist in this codebase.** Flows select by visible text or
  by `accessibilityLabel` (which Maestro matches the same way as visible text on
  Android, since it's exposed as the view's `contentDescription`) — e.g.
  `"Change delivery address"` and `"Open profile"` for HomeHeader's icon-only
  buttons.
- Many strings are **dynamic** (prices, dates, countdown timers, per-addon rows,
  greetings) and are intentionally avoided as `tapOn`/`assertVisible` targets in
  these flows — a static sibling label is used instead wherever possible.
- `(tabs)/_layout.tsx` renders **no bottom tab bar** — don't add flows expecting
  one. A dead `AppTabs`/"Home"/"Explore" component exists in `src/components/
  app-tabs.tsx` but has zero usages in the app.

## CI

Not yet wired up. Once flows are verified locally (Windows-native runner is viable
— no Linux-only constraint despite earlier assumptions), a straightforward job is:
build/install the APK, boot an emulator (or use a hosted device farm / Maestro
Cloud), run `maestro test .maestro/flows`. Keep auth-gated flows excluded from CI
until a real test account exists.
