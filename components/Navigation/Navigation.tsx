import { Slot } from 'expo-router';
import { Platform, View, useWindowDimensions } from 'react-native';
import MobileTabs from './MobileTabs';
import WebSidebar from './WebSidebar';

export default function Navigation() {
  const isWeb = Platform.OS === 'web';
  const { width } = useWindowDimensions();
  const useMobileLayout = !isWeb || width <= 820;

  if (useMobileLayout) {
    return <MobileTabs />;
  }

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <WebSidebar />
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
    </View>
  );
}
