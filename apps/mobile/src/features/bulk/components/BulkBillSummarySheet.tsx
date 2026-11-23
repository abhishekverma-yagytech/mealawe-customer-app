import { forwardRef } from 'react';
import { View } from 'react-native';
import { BottomSheetScrollView, type BottomSheetModal } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSheet } from '@/components/ui/AppSheet';
import { AppText } from '@/components/ui/AppText';
import { BillRow } from '@/components/ui/BillRow';
import { accentTint, palette, useColors } from '@/theme';
import { formatINR } from '@/utils/currency';

import type { BulkBill } from '../bill';

interface BulkBillSummarySheetProps {
  bill: BulkBill;
}

/**
 * Full itemized bulk bill — opened from bulk-cart.tsx's compact "Total Bill"
 * row, same tap-to-expand pattern as the Subscription cart's own
 * `BillSummarySheet` (rather than the old fully-inline itemized card that
 * used to sit directly in the scroll content).
 */
export const BulkBillSummarySheet = forwardRef<BottomSheetModal, BulkBillSummarySheetProps>(
  ({ bill }, ref) => {
    const insets = useSafeAreaInsets();
    const colors = useColors();
    return (
      <AppSheet ref={ref} snapPoints={['50%']}>
        <AppText variant="h2" className="text-foreground px-5 pt-2 pb-3">
          Bill Summary
        </AppText>
        <BottomSheetScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 10 }}>
          <BillRow label={`Items (${bill.totalQty})`} amount={bill.subTotal} />
          {bill.discount > 0 ? <BillRow label="Discount" amount={-bill.discount} positive /> : null}
          <BillRow label="Delivery" amount={bill.delivery} />
          <BillRow label="Packaging" amount={bill.packaging} />
          <BillRow label="Platform fee" amount={bill.platform} />
          <BillRow label="Taxes" amount={bill.taxes} />
          {bill.moneyWalletUsed > 0 ? (
            <BillRow label="Mealawe Wallet" amount={-bill.moneyWalletUsed} positive />
          ) : null}
          {bill.cashbackUsed > 0 ? <BillRow label="Cashback" amount={-bill.cashbackUsed} positive /> : null}
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />
          <View className="flex-row items-center justify-between">
            <AppText variant="label" className="text-foreground">
              To pay
            </AppText>
            <AppText variant="label" className="text-foreground">
              {formatINR(bill.toPay)}
            </AppText>
          </View>
          {bill.saving > 0 ? (
            // Universal savings green, not the Bulk order-mode accent — same
            // "money saved always reads green" convention every other
            // savings indicator in this app uses (the Subscription cart's
            // own BillSummarySheet, coupon banners, wallet/cashback rows).
            <View
              className="rounded-2xl px-3.5 py-3"
              style={{ marginTop: 4, backgroundColor: accentTint(palette.accent.veg, 0.08) }}>
              <AppText variant="label" style={{ color: palette.accent.veg }}>
                You&apos;re saving {formatINR(bill.saving)} on this order
              </AppText>
            </View>
          ) : null}
        </BottomSheetScrollView>
      </AppSheet>
    );
  },
);

BulkBillSummarySheet.displayName = 'BulkBillSummarySheet';
