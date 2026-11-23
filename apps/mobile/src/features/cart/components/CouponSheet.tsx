import { forwardRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheetScrollView, BottomSheetTextInput, type BottomSheetModal } from '@gorhom/bottom-sheet';

import { AppText } from '@/components/ui/AppText';
import { AppSheet } from '@/components/ui/AppSheet';
import { Button } from '@/components/ui/Button';
import { AccentIcon } from '@/components/ui/AccentIcon';
import { IconTicket } from '@/components/ui/icons';
import type { SubscriptionCoupon } from '@/features/subscription';
import { palette, useColors } from '@/theme';
import { formatINR } from '@/utils/currency';

import { discountFor, type DiscountContext } from '../bill';

interface CouponSheetProps {
  coupons: SubscriptionCoupon[];
  ctx: DiscountContext;
  onApply: (coupon: SubscriptionCoupon, itemDiscount: number, deliveryDiscount: number) => void;
  /** Vouchers have no browsable list (see `Voucher`'s doc comment) — this is
   * the only way to redeem one, via the text box above the coupon list.
   * Omit to hide that box entirely (on-demand/bulk carts don't support
   * vouchers yet). */
  onApplyVoucher?: (voucherCode: string) => void;
  onClose: () => void;
  /** True while a coupon or voucher (from any of the cart screen's Apply
   * affordances) is mid-validation — disables every Apply button so a user
   * can't fire a second overlapping validate request. Every row shows the
   * same loading state simultaneously; an acceptable simplification since
   * only one can actually be in flight at a time. */
  applying?: boolean;
  /** The cart screen's shared `couponError` — an invalid/expired code from
   * EITHER a coupon or a voucher applied from in here. Shown right under the
   * voucher box (the only in-sheet redemption affordance without its own
   * per-row `reason` hint) rather than only where the main cart screen
   * already renders it, which sits underneath this sheet and so is
   * invisible while it's open. */
  error?: string | null;
}

/** All available subscription coupons, each with its computed saving + Apply,
 * plus a voucher-code entry box (no browsable voucher list — see
 * `Voucher`'s doc comment). */
export const CouponSheet = forwardRef<BottomSheetModal, CouponSheetProps>(
  ({ coupons, ctx, onApply, onApplyVoucher, onClose, applying, error }, ref) => {
    const insets = useSafeAreaInsets();
    const colors = useColors();
    const [voucherCode, setVoucherCode] = useState('');
    return (
      <AppSheet ref={ref} snapPoints={['70%']} onDismiss={onClose}>
        <AppText variant="h2" className="text-foreground px-5 pt-2 pb-3">
          Coupons &amp; offers
        </AppText>
        <BottomSheetScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 12 }}
        >
          {onApplyVoucher ? (
            <View className="flex-row items-center gap-2">
              <BottomSheetTextInput
                value={voucherCode}
                onChangeText={(t) => setVoucherCode(t.toUpperCase())}
                placeholder="Enter voucher code here"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: colors.foreground,
                }}
              />
              <Button
                label="Apply"
                variant="outline"
                size="sm"
                disabled={!voucherCode.trim() || !!applying}
                loading={!!applying}
                onPress={() => onApplyVoucher(voucherCode)}
              />
            </View>
          ) : null}

          {error ? (
            <AppText variant="caption" className="text-danger" style={{ marginTop: -6 }}>
              {error}
            </AppText>
          ) : null}

          {coupons.length === 0 ? (
            <AppText variant="body" className="text-muted-foreground" style={{ paddingVertical: 16 }}>
              No coupons available right now.
            </AppText>
          ) : (
            coupons.map((c) => {
              const { itemDiscount, deliveryDiscount, reason } = discountFor(c, ctx);
              const discount = itemDiscount + deliveryDiscount;
              return (
                <View
                  key={c.couponCode}
                  className="rounded-2xl border border-border p-4"
                  style={{ gap: 8 }}
                >
                  <View className="flex-row items-center gap-3">
                    <AccentIcon icon={IconTicket} tone="reward" size={18} tileSize={38} />
                    <View className="flex-1">
                      <AppText variant="label" className="text-foreground">
                        {c.couponCode}
                      </AppText>
                      {c.couponHeader ? (
                        <AppText variant="caption" className="text-muted-foreground">
                          {c.couponHeader}
                        </AppText>
                      ) : null}
                    </View>
                    <Button
                      label="Apply"
                      size="sm"
                      disabled={!!reason || !!applying}
                      loading={!!applying}
                      onPress={() => onApply(c, itemDiscount, deliveryDiscount)}
                    />
                  </View>
                  {c.description ? (
                    <AppText variant="bodySm" className="text-muted-foreground">
                      {c.description}
                    </AppText>
                  ) : null}
                  <AppText
                    variant="caption"
                    style={{ color: reason ? colors.mutedForeground : palette.accent.veg }}
                  >
                    {reason ?? `You save ${formatINR(discount)} on this order`}
                  </AppText>
                </View>
              );
            })
          )}
        </BottomSheetScrollView>
      </AppSheet>
    );
  },
);

CouponSheet.displayName = 'CouponSheet';
