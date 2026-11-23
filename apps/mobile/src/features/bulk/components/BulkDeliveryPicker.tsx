import { Pressable, ScrollView, View } from 'react-native';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { IconCalendar, IconClock } from '@/components/ui/icons';
import { palette, shadow } from '@/theme';

import { formatShort } from '../schedule';
import type { DeliverySlot } from '../schedule';

/** "2026-08-03" -> "Mon". Presentational only — schedule.ts's ISO format stays the source of truth. */
function dayOfWeek(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

interface BulkDeliveryPickerProps {
  dateOptions: string[];
  date: string | null;
  onSelectDate: (date: string) => void;
  slots: DeliverySlot[];
  slot: DeliverySlot | null;
  onSelectSlot: (slot: DeliverySlot) => void;
}

/** Delivery date + hourly slot picker for the bulk cart. */
export function BulkDeliveryPicker({
  dateOptions,
  date,
  onSelectDate,
  slots,
  slot,
  onSelectSlot,
}: BulkDeliveryPickerProps) {
  return (
    <View className="rounded-2xl border border-border bg-card p-4" style={[shadow.card, { gap: 10 }]}>
      <View className="flex-row items-center gap-2">
        <AccentIcon icon={IconCalendar} tone="plan" size={14} tileSize={26} />
        <AppText variant="overline" className="text-muted-foreground">
          DELIVERY DATE
        </AppText>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          {dateOptions.map((d) => {
            const active = date === d;
            return (
              <Pressable
                key={d}
                onPress={() => onSelectDate(d)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className={`items-center rounded-xl border px-3 py-2 ${active ? '' : 'border-border'}`}
                style={active ? { borderColor: palette.accent.plan, backgroundColor: palette.accent.plan } : undefined}>
                <AppText variant="caption" className={active ? 'text-white/80' : 'text-muted-foreground'}>
                  {dayOfWeek(d)}
                </AppText>
                <AppText variant="bodySm" className={active ? 'text-white' : 'text-foreground'}>
                  {formatShort(d)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View className="flex-row items-center gap-2" style={{ marginTop: 8 }}>
        <AccentIcon icon={IconClock} tone="info" size={14} tileSize={26} />
        <AppText variant="overline" className="text-muted-foreground">
          DELIVERY SLOT
        </AppText>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          {slots.map((s) => (
            <Pressable
              key={s.start}
              onPress={() => onSelectSlot(s)}
              accessibilityRole="button"
              accessibilityState={{ selected: slot?.start === s.start }}
              className={`rounded-xl border px-3 py-2 ${slot?.start === s.start ? '' : 'border-border'}`}
              style={slot?.start === s.start ? { borderColor: palette.accent.plan, backgroundColor: palette.accent.plan } : undefined}>
              <AppText variant="bodySm" className={slot?.start === s.start ? 'text-white' : 'text-foreground'}>
                {s.start}–{s.end}
              </AppText>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
