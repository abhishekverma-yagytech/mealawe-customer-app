/**
 * Refer & Earn constants — mirrors MealaweServerApp's `reward-points-util.js`
 * (`checkUserFirstOrderReward`'s `rewardPoints`), the source of truth for what
 * actually gets credited. That was 200 (matching the Ionic app's share-sheet
 * text, not its stale ₹50 FAQ copy) until the backend was changed to pay out
 * ₹50 instead — keep this in sync if it changes again.
 */
export const REFERRAL_REWARD = 50;
export const REFERRAL_MIN_ORDER = 499;
export const REFERRAL_VALIDITY_DAYS = 30;

export interface ReferralFaq {
  question: string;
  answer: string;
}

/** Ported from MealaweUserApp's `referfaq.component.ts` (see REFERRAL_REWARD above). */
export const REFERRAL_FAQS: ReferralFaq[] = [
  {
    question: 'How does the Mealawe Refer & Earn program work?',
    answer:
      'When you refer a friend using your referral code, and they successfully place their first order of ₹499 or more, both you and your friend will receive ₹50 as cashback.',
  },
  {
    question: 'When do I receive the ₹50 cashback?',
    answer: 'You will receive your ₹50 cashback only after your referred friend places their first order worth ₹499 or more.',
  },
  {
    question: 'Can I refer multiple friends?',
    answer: 'Yes! You can refer as many friends as you like. You’ll receive ₹50 cashback for each friend who places their first order of ₹499 or more.',
  },
  {
    question: 'How can I use the cashback I received?',
    answer:
      'The cashback can be used while placing future orders on Mealawe.\n\nFor orders of ₹499 or more: you can use 100% of your cashback balance.\n\nFor orders below ₹499: you can use up to 50% of your cashback balance.',
  },
  {
    question: 'Is there any expiry on the cashback amount?',
    answer: 'Yes, the cashback amount is valid for 30 days from the date it is credited to your wallet. After that, it will automatically expire.',
  },
  {
    question: 'Where can I find and share my referral code?',
    answer: 'Open Refer & Earn from your profile — you can copy or share your referral code via WhatsApp, SMS, or any other app directly from here.',
  },
  {
    question: 'What happens if my order is ₹498? Can I still redeem cashback?',
    answer: 'If your order value is less than ₹499, you can redeem only 50% of your available cashback balance.',
  },
];
