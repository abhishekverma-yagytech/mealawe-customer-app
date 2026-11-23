import { Pressable, TextInput, View } from 'react-native';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { IconTicket } from '@/components/ui/icons';
import type { AppliedCoupon } from '@/features/cart';
import type { SubscriptionCoupon } from '@/features/subscription';
import { accentTint, palette, shadow } from '@/theme';

interface BulkCouponCardProps {
  appliedCoupon: AppliedCoupon | null;
  bestCoupon: { coupon: SubscriptionCoupon; discount: number } | null;
  hasCoupons: boolean;
  code: string;
  onCodeChange: (code: string) => void;
  couponError: string | null;
  onApplyByCode: () => void;
  onApplyBest: () => void;
  onClear: () => void;
  onOpenSheet: () => void;
  /** True while a coupon is mid-validation — disables both Apply buttons so
   * a user can't fire a second overlapping usage-check request. */
  applyingCoupon?: boolean;
}

/** Applied-coupon summary, best-available nudge, manual code entry, and "view all" trigger. */
export function BulkCouponCard({
  appliedCoupon,
  bestCoupon,
  hasCoupons,
  code,
  onCodeChange,
  couponError,
  onApplyByCode,
  onApplyBest,
  onClear,
  onOpenSheet,
  applyingCoupon,
}: BulkCouponCardProps) {
  return (
    <View style={shadow.card} className="rounded-2xl border border-border bg-card p-4">
      {appliedCoupon ? (
        <View className="flex-row items-center gap-3">
          <AccentIcon icon={IconTicket} tone="reward" size={18} tileSize={36} />
          <View className="flex-1">
            <AppText variant="label" className="text-foreground">
              {appliedCoupon.couponCode} applied
            </AppText>
            <AppText variant="caption" style={{ color: palette.accent.veg }}>
              You saved ₹{appliedCoupon.discount}
            </AppText>
          </View>
          <Pressable onPress={onClear} accessibilityRole="button" className="active:opacity-70">
            <AppText variant="label" className="text-danger">
              Remove
            </AppText>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {bestCoupon ? (
            <View
              className="flex-row items-center gap-3 rounded-xl px-3 py-2.5"
              style={{ backgroundColor: accentTint(palette.accent.reward, 0.1) }}>
              <AccentIcon icon={IconTicket} tone="reward" size={18} tileSize={36} />
              <View className="flex-1">
                <AppText variant="label" className="text-foreground">
                  {bestCoupon.coupon.couponCode}
                </AppText>
                <AppText variant="caption" style={{ color: palette.accent.veg }}>
                  Save ₹{bestCoupon.discount} on this order
                </AppText>
              </View>
              <Button
                label="Apply"
                size="sm"
                onPress={onApplyBest}
                tone="plan"
                disabled={applyingCoupon}
                loading={applyingCoupon}
              />
            </View>
          ) : null}
          <View className="flex-row items-center gap-2">
            <TextInput
              value={code}
              onChangeText={onCodeChange}
              placeholder="Have a coupon code?"
              placeholderTextColor={palette.neutral.gray500}
              autoCapitalize="characters"
              className="flex-1 rounded-xl border border-input px-3 py-2 font-metropolis text-body-lg text-foreground"
            />
            <Button
              label="Apply"
              variant="outline"
              size="sm"
              onPress={onApplyByCode}
              disabled={!code.trim() || applyingCoupon}
              loading={applyingCoupon}
            />
          </View>
          {hasCoupons ? (
            <Pressable
              onPress={onOpenSheet}
              accessibilityRole="button"
              className="flex-row items-center gap-2 active:opacity-70">
              <IconTicket size={15} color={palette.accent.reward} />
              <AppText variant="label" style={{ color: palette.accent.reward }}>
                View all coupons
              </AppText>
            </Pressable>
          ) : null}
        </View>
      )}
      {couponError ? (
        <AppText variant="caption" className="text-danger" style={{ marginTop: 8 }}>
          {couponError}
        </AppText>
      ) : null}
    </View>
  );
}
