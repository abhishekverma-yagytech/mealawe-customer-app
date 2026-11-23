import { Share } from 'react-native';

import { env } from '@/config';

import { REFERRAL_MIN_ORDER, REFERRAL_REWARD } from './constants';

/** Opens the native share sheet with the same copy pattern as MealaweUserApp's
 * `shareApp()` — code + a fixed OneLink URL. RN's `Share.share` only renders
 * `url` as a separate attachment on iOS, so the link is also folded into
 * `message` for Android. */
export async function shareReferral(code: string): Promise<void> {
  const message = `Hey! Check out this awesome app that delivers home cooked food at your doorstep! Use my code ${code} — we both get ₹${REFERRAL_REWARD} cashback when you place your first order over ₹${REFERRAL_MIN_ORDER}. ${env.storeUrls.oneLink}`;
  try {
    await Share.share(
      { title: 'Mealawe (Enjoy Home Made Food)', message, url: env.storeUrls.oneLink },
      { dialogTitle: 'Share Mealawe with friends' },
    );
  } catch {
    // User dismissed the share sheet — not an error.
  }
}
