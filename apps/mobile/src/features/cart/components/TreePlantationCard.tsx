import { Pressable, TextInput, View } from 'react-native';
import { Image } from 'expo-image';

import { AppText } from '@/components/ui/AppText';
import { IconCheck, IconInfo } from '@/components/ui/icons';
import { accentTint, palette, useColors } from '@/theme';
import { formatINR } from '@/utils/currency';

interface TreePlantationCardProps {
  enabled: boolean;
  receiverName: string;
  /** The add-on's full price (`BillCharges.treePlantationAmount`) — always
   * charged when opted in, never discounted or free, so it's shown here
   * unconditionally rather than a surprise at checkout. */
  amount: number;
  onToggle: () => void;
  onNameChange: (name: string) => void;
}

/**
 * Tree Plantation add-on — an inline-expanding card, not a popup. The
 * planting illustration is a persistent background in the card's
 * bottom-right corner in both the initial and checked states (matches the
 * reference screenshot); checking the box additionally reveals a "Tree
 * Receiver Name" field, and unchecking clears the name and collapses it.
 */
export function TreePlantationCard({
  enabled,
  receiverName,
  amount,
  onToggle,
  onNameChange,
}: TreePlantationCardProps) {
  const colors = useColors();
  return (
    <View
      className="rounded-2xl border p-4"
      style={{
        gap: 12,
        minHeight: 66,
        overflow: 'hidden',
        borderColor: enabled ? palette.brand.green : colors.border,
        backgroundColor: enabled ? accentTint(palette.brand.green, 0.05) : colors.card,
      }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: enabled }}
        accessibilityLabel="Tree Plantation"
        
        className="flex-row items-center gap-3 active:opacity-80">
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: enabled ? palette.brand.green : colors.border,
            backgroundColor: enabled ? palette.brand.green : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {enabled ? <IconCheck size={14} color="#fff" strokeWidth={3} /> : null}
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <AppText variant="label" className="text-foreground">
              Tree Plantation
            </AppText>
            <IconInfo size={14} color={palette.accent.info} />
          </View>
          <AppText variant="caption" className="text-muted-foreground">
            Plant a tree
          </AppText>
        </View>
        <AppText variant="caption" className="text-muted-foreground">
          {formatINR(amount)}
        </AppText>
      </Pressable>
      {enabled ? (
        <TextInput
          value={receiverName}
          onChangeText={onNameChange}
          placeholder="Tree Receiver Name"
          placeholderTextColor={palette.neutral.gray500}
          accessibilityLabel="Tree Receiver Name"
          style={{ paddingRight: 96, width: '70%' }}
          className="rounded-xl border border-input px-3 py-2 font-metropolis text-body-lg text-foreground"
        />
      ) : null}
      {/* persistent decorative background — same illustration in both states */}
      <Image
        source={require('@/assets/images/cart/tree-plantation.png')}
        style={{ position: 'absolute', right: "-3%", bottom: "-2%", width: "100%", height: 66 }}
        contentFit="contain"
        pointerEvents="none"
      />
    </View>
  );
}
