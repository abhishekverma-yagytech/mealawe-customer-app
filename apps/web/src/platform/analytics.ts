import type { Analytics } from '@mealawe/core';

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

/** Pushes shared analytics events (add_to_cart, select_address, ...) onto GTM's dataLayer. */
export const webAnalytics: Analytics = {
  track(eventName, payload) {
    if (typeof window === 'undefined') return;
    (window.dataLayer ??= []).push({ event: eventName, ...payload });
  },
};
