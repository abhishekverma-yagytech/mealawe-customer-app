import { forwardRef } from 'react';
import { Pressable, View } from 'react-native';
import { BottomSheetScrollView, type BottomSheetModal } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSheet } from '@/components/ui/AppSheet';
import { AppText } from '@/components/ui/AppText';
import { BillRow } from '@/components/ui/BillRow';
import { IconChevronRight } from '@/components/ui/icons';
import { accentTint, palette, useColors } from '@/theme';
import { formatINR } from '@/utils/currency';

import type { AppliedCoupon, Bill } from '../types';

interface BillSummarySheetProps {
  bill: Bill;
  /** Package-level discount only (bill.discount minus the coupon's own amount) —
   * same value `cart.tsx` already derives for the inline row it's replacing. */
  planDiscount: number;
  coupon: AppliedCoupon | null;
  /** Tree Plantation's full configured price (`BillCharges.treePlantationAmount`)
   * — the struck-through "original" `BillRow` needs to render "FREE" when
   * `bill.treePlantationCharge` is 0 but the add-on is actually opted in
   * (vs. simply not opted in at all, also 0 — see `treePlantationOpted`). */
  treePlantationAmount: number;
  /** Whether Tree Plantation is opted in — gates showing the row at all;
   * `bill.treePlantationCharge` alone can't distinguish "not opted" from
   * "opted and fully free," both of which are 0. */
  treePlantationOpted: boolean;
  /** Dine In has no delivery/packaging/platform charge at all (eaten at the
   * kitchen, not delivered — see `buildBill`'s `isDineIn` branch, which
   * zeroes all three) — hide those rows entirely instead of showing three
   * "₹0" lines that read as broken, not "not applicable." */
  isDineIn?: boolean;
  onGstPress: () => void;
}

/**
 * Full itemized bill — opened from `cart.tsx`'s compact "Total Bill" row
 * (replaces the old inline expand/collapse card).
 */
export const BillSummarySheet = forwardRef<BottomSheetModal, BillSummarySheetProps>(
  ({ bill, planDiscount, coupon, treePlantationAmount, treePlantationOpted, isDineIn, onGstPress }, ref) => {
    const insets = useSafeAreaInsets();
    const colors = useColors();
    return (
      <AppSheet ref={ref} snapPoints={['50%']}>
        <AppText variant="h2" className="text-foreground px-5 pt-2 pb-3">
          Bill Summary
        </AppText>
        <BottomSheetScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 10 }}>
          <BillRow label={`Plan · ${bill.meals} meals`} amount={bill.packageTotal} />
          {bill.addOnTotal > 0 ? <BillRow label="Extras" amount={bill.addOnTotal} /> : null}
          {planDiscount > 0 ? <BillRow label="Plan discount" amount={-planDiscount} positive /> : null}
          {coupon ? (
            <BillRow label={`Coupon ${coupon.couponCode}`} amount={-coupon.discount} positive />
          ) : null}
          {!isDineIn ? (
            <>
              <BillRow label="Delivery" amount={bill.delivery} original={bill.deliveryOriginal} />
              <BillRow label="Packaging" amount={bill.packaging} original={bill.packagingOriginal} />
              <BillRow label="Platform fee" amount={bill.platform} original={bill.platformOriginal} />
            </>
          ) : null}
          {treePlantationOpted ? (
            <BillRow
              label="Tree Plantation"
              amount={bill.treePlantationCharge}
              original={treePlantationAmount}
            />
          ) : null}
          <Pressable
            onPress={onGstPress}
            accessibilityRole="button"
            className="flex-row items-center justify-between active:opacity-70">
            <AppText variant="body" className="text-muted-foreground">
              GST (govt. taxes)
            </AppText>
            <View className="flex-row items-center gap-1">
              <AppText variant="body" className="text-foreground">
                {formatINR(bill.taxes)}
              </AppText>
              <IconChevronRight size={14} color={colors.mutedForeground} />
            </View>
          </Pressable>
          {bill.moneyWalletUsed > 0 ? (
            <BillRow label="Wallet credit" amount={-bill.moneyWalletUsed} positive />
          ) : null}
          {bill.cashbackUsed > 0 ? (
            <BillRow label="Cashback credit" amount={-bill.cashbackUsed} positive />
          ) : null}
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
            <View
              className="rounded-2xl px-3.5 py-3"
              style={{ marginTop: 4, backgroundColor: accentTint(palette.brand.green, 0.08) }}>
              <AppText variant="label" style={{ color: palette.brand.greenDark }}>
                You&apos;re saving {formatINR(bill.saving)} on this order
              </AppText>
            </View>
          ) : null}
        </BottomSheetScrollView>
      </AppSheet>
    );
  },
);

BillSummarySheet.displayName = 'BillSummarySheet';
