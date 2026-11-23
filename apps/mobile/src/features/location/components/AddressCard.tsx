import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconMapPin } from '@/components/ui/icons';
import { palette } from '@/theme';

import { addressLabel, type Address } from '../types';

interface AddressCardProps {
  address: Address;
  isCurrent: boolean;
  isDisabled?: boolean;
  onSelect: () => void;
  /** Omit to hide the Edit/Delete row entirely — e.g. a read-only "here's
   * your selected address" card (subscription Configure's "Deliver to")
   * that only wants the info + "Current" marker, not inline management. */
  onEdit?: () => void;
  onDelete?: () => void;
}

/** A saved-address row: tag + lines, a "current" marker, and (optionally) edit / delete. */
export function AddressCard({ address, isCurrent, isDisabled = false, onSelect, onEdit, onDelete }: AddressCardProps) {
  return (
    <Pressable
      disabled={isDisabled}
      onPress={onSelect}
      className={
        isCurrent
          ? 'rounded-2xl border-2 border-primary bg-muted p-4 active:opacity-90'
          : 'rounded-2xl border border-border bg-card p-4 active:opacity-90'
      }
      accessibilityRole="button"
      accessibilityState={{ selected: isCurrent }}>
      <View className="flex-row items-start gap-3">
        <View className="mt-0.5">
          <IconMapPin size={20} color={palette.brand.green} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <AppText variant="label" className="text-foreground">
              {address.tagLocation ? capitalize(address.tagLocation) : 'Address'}
            </AppText>
            {isCurrent && (
              <View className="rounded-full bg-primary px-2 py-0.5">
                <AppText variant="overline" className="text-primary-foreground">
                  Current
                </AppText>
              </View>
            )}
          </View>
          <AppText variant="bodySm" className="mt-0.5 text-muted-foreground" numberOfLines={2}>
            {addressLabel(address)}
          </AppText>
          {!!address.landmark && (
            <AppText variant="caption" className="mt-0.5 text-muted-foreground">
              Near {address.landmark}
            </AppText>
          )}

          {onEdit || onDelete ? (
            <View className="mt-3 flex-row gap-4">
              {onEdit ? (
                <Pressable onPress={onEdit} hitSlop={8} className="active:opacity-70">
                  <AppText variant="label" className="text-primary">
                    Edit
                  </AppText>
                </Pressable>
              ) : null}
              {onDelete ? (
                <Pressable onPress={onDelete} hitSlop={8} className="active:opacity-70">
                  <AppText variant="label" className="text-danger">
                    Delete
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
