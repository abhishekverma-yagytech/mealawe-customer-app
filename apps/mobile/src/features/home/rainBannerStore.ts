import { create } from 'zustand';

interface RainBannerState {
  /** Whether the rain banner has already played its show/hold/hide sequence
   * this app-foreground session — prevents it replaying every time the user
   * revisits Home while `showRainyNotification` stays on. */
  hasShownThisSession: boolean;
  markShown: () => void;
}

export const useRainBannerStore = create<RainBannerState>((set) => ({
  hasShownThisSession: false,
  markShown: () => set({ hasShownThisSession: true }),
}));
