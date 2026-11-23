import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconApartment, IconCheck, IconClock, IconClose, IconDelivery, IconDot, IconLeaf } from '@/components/ui/icons';
import { accentTint, mixHex, shadow, useApartmentColors } from '@/theme';

import type { ApartmentKitchen, MealType, OrderType } from '../types';

export type ApartmentDiet = 'any' | 'veg' | 'nonveg';
export type ApartmentDeliveryType = 'any' | 'delivery' | 'pickup';

interface ApartmentFilterModalProps {
  visible: boolean;
  onClose: () => void;
  kitchens: ApartmentKitchen[];
  /** Tab this modal opened from — each kitchen's delivery/pickup row reads this type's own `fulfillmentModes` entry. */
  orderType: OrderType;
  diet: ApartmentDiet;
  onDietChange: (diet: ApartmentDiet) => void;
  deliveryType: ApartmentDeliveryType;
  onDeliveryTypeChange: (type: ApartmentDeliveryType) => void;
  kitchenFilter: Set<string>;
  onKitchenToggle: (kitchenId: string) => void;
  /** Today-only: narrows the grid to one meal slot; `'all'` = no narrowing. */
  mealSlot: MealType | 'all';
  onMealSlotChange: (slot: MealType | 'all') => void;
  filterCount: number;
  matchCount: number;
  onClear: () => void;
}

// Labels only — `key` values are unchanged and drive filtering elsewhere.
const DIET_OPTS: { key: ApartmentDiet; label: string }[] = [
  { key: 'any', label: 'All' },
  { key: 'veg', label: 'Veg' },
  { key: 'nonveg', label: 'Non-Veg' },
];

const DELIVERY_OPTS: { key: ApartmentDeliveryType; label: string; icon: React.ComponentType<{ size?: number; color?: string }> }[] = [
  { key: 'any', label: 'Both', icon: IconDot },
  { key: 'delivery', label: 'Delivery', icon: IconDelivery },
  { key: 'pickup', label: 'Self-pickup', icon: IconApartment },
];

const MEAL_SLOT_OPTS: (MealType | 'all')[] = ['all', 'Breakfast', 'Lunch', 'HighTea', 'Dinner'];

/** "Refine your menu" filter popup: diet → delivery mode → kitchens, each single/multi-select; backdrop, "Okay", or "Clear" all close it (Clear also resets filters). */
export function ApartmentFilterModal({
  visible,
  onClose,
  kitchens,
  orderType,
  diet,
  onDietChange,
  deliveryType,
  onDeliveryTypeChange,
  kitchenFilter,
  onKitchenToggle,
  mealSlot,
  onMealSlotChange,
  filterCount,
  matchCount,
  onClear,
}: ApartmentFilterModalProps) {
  // `tone` matches the active tab's accent color, same as ApartmentOrderTypeTabs.
  const { colors, orderType: orderTypeColors } = useApartmentColors();
  const tone = orderTypeColors[orderType];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1" style={{ backgroundColor: 'rgba(27,33,28,.35)' }} onPress={onClose} accessibilityLabel="Close filters" />
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: 112, left: 14, right: 14, maxHeight: '72%' }}>
        {/* Translucent fill so the panel doesn't feel too heavy over the dimmed backdrop. */}
        <View style={[shadow.card, { backgroundColor: colors.card, borderRadius: 22, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }]}>
          <LinearGradient colors={[tone.accent, mixHex(tone.accent, '#000000', 0.28)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingHorizontal: 14, paddingVertical: 11 }}>
            <View className="flex-row items-center justify-between gap-2.5">
              <View className="min-w-0 flex-1">
                <AppText variant="label" style={{ color: '#fff', fontSize: 14.5 }}>
                  Refine your menu
                </AppText>
                <AppText variant="caption" numberOfLines={1} style={{ color: 'rgba(255,255,255,.76)', fontSize: 10.5, marginTop: 1 }}>
                  {filterCount > 0 ? `${filterCount} ${filterCount === 1 ? 'filter' : 'filters'} · ${matchCount} matching` : 'Showing everything cooking today'}
                </AppText>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={6}
                style={{ width: 26, height: 26, borderRadius: 999, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' }}>
                <IconClose size={13} color="#fff" />
              </Pressable>
            </View>
          </LinearGradient>

          <ScrollView style={{ paddingHorizontal: 14 }} contentContainerStyle={{ paddingTop: 12, paddingBottom: 4 }}>
            <FilterSectionLabel icon={IconLeaf} label="FOOD PREFERENCE" accent={tone.accent} />
            <View className="flex-row" style={{ gap: 7 }}>
              {DIET_OPTS.map((d) => {
                const active = diet === d.key;
                const activeColor = d.key === 'nonveg' ? '#c2461f' : tone.accent;
                return (
                  <Pressable
                    key={d.key}
                    onPress={() => onDietChange(d.key)}
                    className="flex-1 flex-row items-center justify-center"
                    style={{
                      gap: 5,
                      paddingVertical: 9,
                      paddingHorizontal: 4,
                      borderRadius: 13,
                      backgroundColor: active ? activeColor : colors.page,
                      borderWidth: active ? 0 : 1,
                      borderColor: colors.borderSoft,
                    }}>
                    {d.key !== 'any' ? (
                      <View
                        style={{
                          width: 15,
                          height: 15,
                          borderRadius: 4,
                          borderWidth: 1.5,
                          borderColor: active ? '#fff' : activeColor,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                        <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: active ? '#fff' : activeColor }} />
                      </View>
                    ) : null}
                    <AppText variant="caption" weight="bold" style={{ color: active ? '#fff' : colors.mutedLine, fontSize: 12 }}>
                      {d.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <FilterSectionLabel icon={IconDelivery} label="HOW YOU'LL GET IT" style={{ marginTop: 13 }} accent={tone.accent} />
            <View className="flex-row" style={{ gap: 3, padding: 3, borderRadius: 999, backgroundColor: colors.borderSoft }}>
              {DELIVERY_OPTS.map((d) => {
                const active = deliveryType === d.key;
                const Icon = d.icon;
                return (
                  <Pressable
                    key={d.key}
                    onPress={() => onDeliveryTypeChange(d.key)}
                    className="flex-1 flex-row items-center justify-center"
                    style={{
                      gap: 5,
                      paddingVertical: 8,
                      paddingHorizontal: 4,
                      borderRadius: 999,
                      backgroundColor: active ? tone.accent : 'transparent',
                    }}>
                    <Icon size={15} color={active ? '#fff' : colors.mutedLine} />
                    <AppText variant="caption" weight="bold" style={{ color: active ? '#fff' : colors.mutedLine, fontSize: 11.5 }}>
                      {d.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {/* Today-only; wraps to a second line since there are 5 slot options. */}
            {orderType === 'today' ? (
              <>
                <FilterSectionLabel icon={IconClock} label="MEAL SLOT" style={{ marginTop: 13 }} accent={tone.accent} />
                <View className="flex-row flex-wrap" style={{ gap: 7 }}>
                  {MEAL_SLOT_OPTS.map((slot) => {
                    const active = mealSlot === slot;
                    return (
                      <Pressable
                        key={slot}
                        onPress={() => onMealSlotChange(slot)}
                        className="items-center justify-center"
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 13,
                          borderRadius: 999,
                          backgroundColor: active ? tone.accent : colors.page,
                          borderWidth: active ? 0 : 1,
                          borderColor: colors.borderSoft,
                        }}>
                        <AppText variant="caption" weight="bold" style={{ color: active ? '#fff' : colors.mutedLine, fontSize: 12 }}>
                          {slot === 'all' ? 'All' : slot}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            <View className="flex-row items-center justify-between" style={{ marginTop: 13, marginBottom: 7 }}>
              <FilterSectionLabel icon={IconApartment} label="KITCHENS" accent={tone.accent} />
              <AppText variant="caption" style={{ color: colors.muted, fontSize: 10 }}>
                {kitchenFilter.size ? `${kitchenFilter.size} selected` : 'All kitchens'}
              </AppText>
            </View>
            <View style={{ gap: 7, maxHeight: 150 }}>
              <ScrollView style={{ maxHeight: 150 }}>
                {kitchens.map((k) => {
                  const on = kitchenFilter.has(k._id);
                  // Fulfillment modes are per order type, not a fixed default.
                  const modes = k.apartmentSettings?.fulfillmentModes?.[orderType];
                  const wingBlock = k.apartmentSettings?.wingName && k.apartmentSettings?.roomNumber
                    ? `${k.apartmentSettings.wingName} · ${k.apartmentSettings.roomNumber}`
                    : k.apartmentSettings?.wingName || k.apartmentSettings?.roomNumber;
                  const modeText = modes ? (modes.deliveryEnabled ? (modes.pickupEnabled ? 'Delivery & self-pickup' : 'Delivery only') : 'Self-pickup only') : undefined;
                  return (
                    <Pressable
                      key={k._id}
                      onPress={() => onKitchenToggle(k._id)}
                      className="flex-row items-center"
                      style={{
                        gap: 9,
                        padding: 8,
                        paddingHorizontal: 10,
                        borderRadius: 14,
                        backgroundColor: on ? accentTint(tone.accent, 0.08) : colors.card,
                        borderWidth: 1,
                        borderColor: on ? tone.accent : colors.borderSoft,
                        marginBottom: 7,
                      }}>
                      <View style={{ width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? tone.accent : colors.borderSoft }}>
                        <AppText variant="label" style={{ color: on ? '#fff' : tone.accent, fontSize: 13 }}>
                          {k.kitchenName.charAt(0)}
                        </AppText>
                      </View>
                      <View className="min-w-0 flex-1">
                        <AppText variant="label" numberOfLines={1} style={{ color: colors.ink, fontSize: 13.5 }}>
                          {k.kitchenName}
                        </AppText>
                        <AppText variant="caption" numberOfLines={1} style={{ color: colors.muted, fontSize: 10.5, marginTop: 1 }}>
                          {[wingBlock, modeText].filter(Boolean).join(' · ')}
                        </AppText>
                      </View>
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 999,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: on ? tone.accent : 'transparent',
                          borderWidth: on ? 0 : 1.5,
                          borderColor: colors.border,
                        }}>
                        {on ? <IconCheck size={13} color="#fff" strokeWidth={3.4} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </ScrollView>

          <View className="flex-row items-center" style={{ gap: 8, borderTopWidth: 1, borderColor: colors.borderSoft, padding: 10, paddingHorizontal: 14 }}>
            <Pressable
              onPress={onClear}
              disabled={filterCount === 0}
              className="items-center justify-center"
              style={{
                paddingVertical: 11,
                paddingHorizontal: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: filterCount > 0 ? colors.border : colors.borderSoft,
              }}>
              <AppText variant="caption" weight="bold" style={{ color: filterCount > 0 ? colors.ink : colors.muted, fontSize: 13 }}>
                Clear
              </AppText>
            </Pressable>
            <Pressable onPress={onClose} className="flex-1 items-center justify-center" style={{ backgroundColor: tone.accent, borderRadius: 14, paddingVertical: 11 }}>
              <AppText variant="caption" weight="bold" style={{ color: '#fff', fontSize: 13 }}>
                {matchCount > 0 ? `Show ${matchCount} ${matchCount === 1 ? 'dish' : 'dishes'}` : 'No matches'}
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FilterSectionLabel({
  icon: Icon,
  label,
  style,
  accent,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  style?: object;
  /** Falls back to `colors.green` if not order-type-scoped. */
  accent?: string;
}) {
  const { colors } = useApartmentColors();
  return (
    <View className="flex-row items-center" style={[{ gap: 7, marginBottom: 7 }, style]}>
      <Icon size={15} color={accent ?? colors.green} />
      <AppText variant="caption" weight="bold" style={{ color: colors.ink, fontSize: 10.5, letterSpacing: 0.3 }}>
        {label}
      </AppText>
    </View>
  );
}
