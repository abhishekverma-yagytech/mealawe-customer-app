import type { LucideIcon } from 'lucide-react-native';
import { Modal, Pressable, View } from 'react-native';

import { palette, shadow } from '@/theme';

import { AppText } from './AppText';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles the confirm button red and tints the icon for a destructive action. */
  destructive?: boolean;
  icon?: LucideIcon;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Branded confirmation dialog — a centered card over a dimmed backdrop, replacing
 * the OS `Alert`. Tap-outside cancels. Used for destructive confirms (sign out).
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  icon: Icon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const accent = destructive ? palette.status.danger : palette.brand.green;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable
        onPress={onCancel}
        className="flex-1 items-center justify-center bg-black/50 px-8">
        {/* Stop propagation so taps on the card don't dismiss it. */}
        <Pressable onPress={() => {}} style={shadow.lifted} className="w-full max-w-sm rounded-3xl bg-card p-6">
          {Icon && (
            <View
              className="mb-4 h-14 w-14 items-center justify-center self-center rounded-full"
              style={{ backgroundColor: `${accent}1F` }}>
              <Icon size={28} color={accent} />
            </View>
          )}
          <AppText variant="h3" className="text-center text-foreground">
            {title}
          </AppText>
          {!!message && (
            <AppText variant="body" className="mt-2 text-center text-muted-foreground">
              {message}
            </AppText>
          )}

          <View className="mt-6 flex-row gap-3">
            <Pressable
              onPress={onCancel}
              className="flex-1 items-center rounded-2xl border border-border py-3.5 active:opacity-80"
              accessibilityRole="button">
              <AppText variant="label" className="text-foreground">
                {cancelLabel}
              </AppText>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              className={
                destructive
                  ? 'flex-1 items-center rounded-2xl bg-danger py-3.5 active:opacity-80'
                  : 'flex-1 items-center rounded-2xl bg-primary py-3.5 active:opacity-80'
              }
              accessibilityRole="button">
              <AppText variant="label" className="text-white">
                {confirmLabel}
              </AppText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
