import { Slot } from 'expo-router';
import { Platform, View } from 'react-native';
import MobileTabs from './MobileTabs';
import WebSidebar from './WebSidebar';

export default function Navigation() {
  const isWeb = Platform.OS === 'web';

  if (isWeb) {
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <WebSidebar />
        <View style={{ flex: 1 }}>
          <Slot />
        </View>
      </View>
    );
  }

  return <MobileTabs />;
}
