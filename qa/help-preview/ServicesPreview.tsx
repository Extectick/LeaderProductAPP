/** The product screen/header with fixture access; no login or API requests. */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppHeader } from '../../components/AppHeader';
import { ScreenBlurProvider } from '../../components/ui/AppScreenBlur';
import { useThemeColor } from '../../hooks/useThemeColor';
import ServicesCatalogScreen from '../../src/features/services/ui/ServicesCatalogScreen';

export default function ServicesPreview() {
  const background = useThemeColor({}, 'background');
  return <ScreenBlurProvider><View testID="services-qa-surface" style={{ flex: 1, backgroundColor: background }}>
    <ServicesCatalogScreen/>
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { bottom: undefined, zIndex: 20 }]}>
      <AppHeader title="Каталог сервисов" subtitle="Все доступные сервисы" icon="apps-outline" showBack={false} variant="flat" entranceMotion="none" showServerStatus={false}/>
    </View>
  </View></ScreenBlurProvider>;
}
