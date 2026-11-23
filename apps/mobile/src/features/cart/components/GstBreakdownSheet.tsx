import { forwardRef } from 'react';
import { View } from 'react-native';
import { BottomSheetScrollView, BottomSheetView, type BottomSheetModal } from '@gorhom/bottom-sheet';

import { AppSheet } from '@/components/ui/AppSheet';
import { AppText } from '@/components/ui/AppText';
import { BillRow } from '@/components/ui/BillRow';
import { useColors } from '@/theme';
import { formatINR } from '@/utils/currency';

import type { Bill } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface GstBreakdownSheetProps {
  bill: Bill;
  /** Dine-in orders have no delivery charge, so no delivery-GST row applies. */
  isDineIn?: boolean;
}

/**
 * GST split by component (item / delivery / packaging / platform) — opened
 * from `BillSummarySheet`'s "GST & charges" row. A small `AppSheet` like every
 * other popup in the app, not a centered dialog (see the design spec).
 */
export const GstBreakdownSheet = forwardRef<BottomSheetModal, GstBreakdownSheetProps>(
  ({ bill, isDineIn }, ref) => {
    const insets = useSafeAreaInsets();
    const colors = useColors();
    return (
      <AppSheet ref={ref} stackBehavior="push">
        <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 10 }}>
          <AppText variant="h2" className="text-foreground">
            GST breakdown
          </AppText>
          <AppText variant="caption" className="text-muted-foreground">
            Mealawe has no role to play in taxes levied by the govt.
          </AppText>
          <View style={{ gap: 10, marginTop: 4 }}>
            <BillRow label="GST on item total" amount={bill.itemGst} />
            {!isDineIn && bill.deliveryGst > 0 ? (
              <BillRow label="GST on delivery" amount={bill.deliveryGst} />
            ) : null}
            {bill.packagingGst > 0 ? (
              <BillRow label="GST on packaging" amount={bill.packagingGst} />
            ) : null}
            {bill.platformGst > 0 ? (
              <BillRow label="GST on platform fee" amount={bill.platformGst} />
            ) : null}
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />
            <View className="flex-row items-center justify-between">
              <AppText variant="label" className="text-foreground">
                Total GST
              </AppText>
              <AppText variant="label" className="text-foreground">
                {formatINR(bill.taxes)}
              </AppText>
            </View>
          </View>
        </BottomSheetScrollView>
      </AppSheet>
    );
  },
);

GstBreakdownSheet.displayName = 'GstBreakdownSheet';
