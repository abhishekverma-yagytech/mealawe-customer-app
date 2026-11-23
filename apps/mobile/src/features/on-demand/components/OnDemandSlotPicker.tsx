import { Pressable, ScrollView, View } from 'react-native';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { IconCalendar, IconClock } from '@/components/ui/icons';
import { palette, shadow } from '@/theme';

import { formatShort } from '../schedule';
import type { TimeSlot } from '../schedule';
import type { OnDemandMode } from '../types';

function dayOfWeek(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

interface OnDemandSlotPickerProps {
  mode: OnDemandMode;
  /** Date chips — only rendered for Advance mode (Daily is always today). */
  dateOptions: string[];
  date: string | null;
  onSelectDate: (date: string) => void;
  slots: TimeSlot[];
  slot: TimeSlot | null;
  onSelectSlot: (slot: TimeSlot) => void;
}

/** Date (Advance only) + hourly slot picker — same visual pattern as
 * BulkDeliveryPicker. */
export function OnDemandSlotPicker({
  mode,
  dateOptions,
  date,
  onSelectDate,
  slots,
  slot,
  onSelectSlot,
}: OnDemandSlotPickerProps) {
  return (
    <View className="rounded-2xl border border-border bg-card p-4" style={[shadow.card, { gap: 10 }]}>
      {mode === 'advance' ? (
        <>
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
                    style={active ? { borderColor: palette.accent.info, backgroundColor: palette.accent.info } : undefined}>
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
        </>
      ) : null}

      <View className="flex-row items-center gap-2" style={{ marginTop: mode === 'advance' ? 8 : 0 }}>
        <AccentIcon icon={IconClock} tone="info" size={14} tileSize={26} />
        <AppText variant="overline" className="text-muted-foreground">
          DELIVERY SLOT
        </AppText>
      </View>
      {slots.length === 0 ? (
        <AppText variant="bodySm" className="text-muted-foreground">
          No delivery slots available right now.
        </AppText>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            {slots.map((s) => (
              <Pressable
                key={s.start}
                onPress={() => onSelectSlot(s)}
                accessibilityRole="button"
                accessibilityState={{ selected: slot?.start === s.start }}
                className={`rounded-xl border px-3 py-2 ${slot?.start === s.start ? '' : 'border-border'}`}
                style={slot?.start === s.start ? { borderColor: palette.accent.info, backgroundColor: palette.accent.info } : undefined}>
                <AppText variant="bodySm" className={slot?.start === s.start ? 'text-white' : 'text-foreground'}>
                  {s.start}–{s.end}
                </AppText>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
