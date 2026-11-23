import { ENDPOINTS, http } from '@mealawe/core';

/**
 * Admin-configured splash-screen Lottie animation (dashboard-managed,
 * mealaweDashboard's "Common App Config" page) — common to every user, no
 * cluster scoping. `null` if none is set or the fetch fails;
 * `SplashAnimationOverlay` falls back to its bundled local animation in
 * either case, same "empty/error means fall back" convention as
 * `authApi.getActiveLoginVideo`.
 */
export const splashApi = {
  getActiveSplashLottie: async (): Promise<{ lottieFile: string } | null> => {
    try {
      const lottie = await http.get<{ lottieFile: string } | null>(ENDPOINTS.splash.activeSplashLottie);
      return lottie ?? null;
    } catch {
      return null;
    }
  },
};
