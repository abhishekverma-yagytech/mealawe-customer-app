import { forwardRef, useCallback } from 'react';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  type BottomSheetModalProps,
} from '@gorhom/bottom-sheet';

import { useColors } from '@/theme';

interface AppSheetProps {
  children: React.ReactNode;
  /** Optional fixed snap points (e.g. ['85%']). Omit for dynamic sizing. */
  snapPoints?: (string | number)[];
  onDismiss?: () => void;
  /**
   * Whether dragging inside the sheet's content area resizes/dismisses it.
   * Defaults to `true` (the library default) — set `false` for a sheet whose
   * content has its own horizontal scroll, since the content-panning gesture
   * otherwise competes with that scroll's touch handling and can prevent it
   * from ever receiving the drag. The handle itself stays draggable either way.
   */
  enableContentPanningGesture?: boolean;
  /**
   * How this sheet behaves when presented while another `AppSheet` is
   * already open. Library default is `'switch'`, which *minimizes* (hides)
   * the currently open sheet — surprising for a sheet that's meant to open
   * "on top of" another one (e.g. GST breakdown over Bill Summary). Pass
   * `'push'` for that case so the sheet underneath stays open and reappears
   * once this one is dismissed.
   */
  stackBehavior?: BottomSheetModalProps['stackBehavior'];
}

/**
 * The app's bottom-sheet shell — a `BottomSheetModal` with a dimmed backdrop
 * (tap-to-close), rounded top, and the brand handle. Content is provided by the
 * caller (wrap scrollable content in `BottomSheetScrollView`). Present / dismiss
 * imperatively via the forwarded ref.
 *
 * @example
 * const ref = useRef<BottomSheetModal>(null);
 * <AppSheet ref={ref}> … </AppSheet>
 * ref.current?.present();
 */
export const AppSheet = forwardRef<BottomSheetModal, AppSheetProps>(
  ({ children, snapPoints, onDismiss, enableContentPanningGesture, stackBehavior }, ref) => {
    const colors = useColors();
    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enableDynamicSizing={!snapPoints}
        enableContentPanningGesture={enableContentPanningGesture}
        stackBehavior={stackBehavior}
        onDismiss={onDismiss}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground, width: 44 }}
        backgroundStyle={{
          backgroundColor: colors.card,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
        }}
      >
        {children}
      </BottomSheetModal>
    );
  },
);

AppSheet.displayName = 'AppSheet';
