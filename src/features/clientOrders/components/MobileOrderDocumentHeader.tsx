import { useFocusEffect } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { useServicesHeaderSlot } from '@/src/features/services/headerSlotContext';

type Props = {
  visible: boolean;
  onBack: () => void;
  titleSlot: React.ReactNode;
  rightSlot: React.ReactNode;
  bottomSlot: React.ReactNode;
};

export function MobileOrderDocumentHeader({ visible, onBack, titleSlot, rightSlot, bottomSlot }: Props) {
  const { setHeaderOverride } = useServicesHeaderSlot();
  // The route owns the list, picker and editor headers. Publishing editor JSX
  // from a layout effect used to make every changed action render the navigator.
  useFocusEffect(React.useCallback(() => {
    setHeaderOverride({ hidden: true });
    return () => setHeaderOverride(null);
  }, [setHeaderOverride]));

  if (!visible) return null;
  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <AppHeader
        title="Заказы клиентов"
        icon="receipt-outline"
        titleSlot={titleSlot}
        showBack
        onBack={onBack}
        compact
        dense
        horizontalPadding={6}
        rightSlot={rightSlot}
        bottomSlot={bottomSlot}
        surfaceVisible
        entranceMotion="none"
        variant="document"
        showServerStatus={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
});
