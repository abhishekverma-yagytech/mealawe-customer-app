import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconMapPin } from '@/components/ui/icons';
import { palette } from '@/theme';

import { AddressCard } from './AddressCard';
import { addressLabel, isSameAddress, type Address } from '../types';

interface DeliverToSectionProps {
  saved: readonly Address[];
  current: Address | null;
  onSelect: (addr: Address) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onAddNew: () => void;
}

/**
 * "Deliver to" — saved-address cards (tapping one selects it via `onSelect`)
 * plus a dashed "add new" entry. Used by screens that need real address
 * *selection* without leaving the page (e.g. the subscription Configure
 * screen) — `/addresses` itself manages the list (GPS detect, a header,
 * navigate-away-on-select) and is different enough in shape that it keeps
 * its own render block rather than sharing this one; both now share the
 * single `isSameAddress` compare rule from `../types` instead of each
 * re-implementing it.
 */
export function DeliverToSection({
  saved,
  current,
  onSelect,
  onEdit,
  onDelete,
  onAddNew,
}: DeliverToSectionProps) {
  const currentIsUnsaved = current != null && !saved.some((a) => isSameAddress(a, current));

  return (
    <View style={{ gap: 10 }}>
      {currentIsUnsaved ? (
        <View className="flex-row items-start gap-2 px-1">
          <IconMapPin size={14} color={palette.neutral.gray500} style={{ marginTop: 2 }} />
          <AppText variant="bodySm" className="flex-1 text-muted-foreground">
            Delivering to: {addressLabel(current)}
          </AppText>
        </View>
      ) : null}

      {saved.length === 0 && !currentIsUnsaved ? (
        <AppText variant="bodySm" className="text-muted-foreground">
          No delivery address saved yet.
        </AppText>
      ) : null}

      {saved.map((addr, i) => (
        <AddressCard
          key={addr._id ?? `${addr.geolocation?.lat},${addr.geolocation?.lng},${i}`}
          address={addr}
          isCurrent={isSameAddress(addr, current)}
          onSelect={() => onSelect(addr)}
          onEdit={() => onEdit(i)}
          onDelete={() => onDelete(i)}
        />
      ))}

      <Pressable
        onPress={onAddNew}
        className="items-center rounded-2xl border border-dashed border-border py-3.5 active:opacity-80"
        accessibilityRole="button"
      >
        <AppText variant="label" className="text-foreground">
          + Add a new address
        </AppText>
      </Pressable>
    </View>
  );
}
