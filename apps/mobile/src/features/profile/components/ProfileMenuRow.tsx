import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { AccentIcon } from '@/components/ui/AccentIcon';
import { IconChevronRight } from '@/components/ui/icons';
import { palette, accentTint, shadow, type AccentTone } from '@/theme';

interface ProfileMenuRowProps {
  icon: LucideIcon;
  label: string;
  sub?: string;
  /** Accent tone for the icon (varied per row — never all-green). */
  tone?: AccentTone;
  /** Destructive rows (e.g. Sign out) render the icon + label in danger red. */
  destructive?: boolean;
  /** Overrides the trailing chevron — e.g. a `Toggle` for an on/off row. */
  right?: ReactNode;
  onPress: () => void;
}

/** A single tappable account menu row: colored icon · label/sub · chevron
 * (or a custom trailing element via `right`, e.g. a toggle switch). */
export function ProfileMenuRow({
  icon: Icon,
  label,
  sub,
  tone = 'plan',
  destructive = false,
  right,
  onPress,
}: ProfileMenuRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={shadow.card}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 active:opacity-80"
      accessibilityRole="button">
      {destructive ? (
        <View
          className="h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: accentTint(palette.status.danger) }}>
          <Icon size={20} color={palette.status.danger} />
        </View>
      ) : (
        <AccentIcon icon={Icon} tone={tone} size={20} tileSize={40} />
      )}
      <View className="flex-1">
        <AppText variant="label" className={destructive ? 'text-danger' : 'text-foreground'}>
          {label}
        </AppText>
        {!!sub && (
          <AppText variant="caption" className="text-muted-foreground">
            {sub}
          </AppText>
        )}
      </View>
      {right ?? <IconChevronRight size={20} color={palette.neutral.gray500} />}
    </Pressable>
  );
}
