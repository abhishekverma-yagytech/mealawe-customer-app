import type { ComponentType } from 'react';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from './AppText';
import { IconChevronDown, IconChevronUp, type IconProps } from './icons';
import { accentTint, palette } from '@/theme';

export interface FaqItem {
  question: string;
  answer: string;
  /**
   * Optional leading icon, shown on a soft-tinted circular tile before the
   * question — used by the Apartment education screen's per-question colored
   * icons. Omit to keep the plain text-only row Help & Refer-Earn already use.
   */
  icon?: ComponentType<IconProps>;
  /** Hex color for `icon` + its tint tile. Ignored when `icon` is omitted. */
  iconColor?: string;
}

interface FaqAccordionProps {
  items: FaqItem[];
}

/**
 * Expand/collapse FAQ list, one item open at a time — shared between
 * Refer & Earn and Help & Support (previously two near-identical copies).
 */
export function FaqAccordion({ items }: FaqAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <>
      {items.map((faq, i) => {
        const isOpen = openIndex === i;
        const iconColor = faq.iconColor ?? palette.brand.green;
        return (
          <Pressable
            key={i}
            onPress={() => setOpenIndex(isOpen ? null : i)}
            className="rounded-2xl border border-border bg-card p-4 active:opacity-90">
            <View className="flex-row items-center gap-3">
              {faq.icon && (
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    backgroundColor: accentTint(iconColor, 0.15),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <faq.icon size={16} color={iconColor} />
                </View>
              )}
              <AppText variant="label" className="flex-1 text-foreground">
                {faq.question}
              </AppText>
              {isOpen ? (
                <IconChevronUp size={18} color={palette.neutral.gray500} />
              ) : (
                <IconChevronDown size={18} color={palette.neutral.gray500} />
              )}
            </View>
            {isOpen &&
              faq.answer.split('\n').map((line, j) => (
                <AppText key={j} variant="bodySm" className="mt-2 text-muted-foreground">
                  {line}
                </AppText>
              ))}
          </Pressable>
        );
      })}
    </>
  );
}
