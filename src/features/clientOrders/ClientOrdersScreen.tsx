import React from 'react';
import { Platform, useWindowDimensions } from 'react-native';

import ClientOrdersMobileScreen from './ClientOrdersMobileScreen';
import ClientOrdersWebScreen from './ClientOrdersWebScreen';

const WEB_DESKTOP_BREAKPOINT = 1024;

export default function ClientOrdersScreen() {
  const { width } = useWindowDimensions();

  if (Platform.OS === 'web' && width >= WEB_DESKTOP_BREAKPOINT) {
    return <ClientOrdersWebScreen />;
  }

  return <ClientOrdersMobileScreen />;
}
