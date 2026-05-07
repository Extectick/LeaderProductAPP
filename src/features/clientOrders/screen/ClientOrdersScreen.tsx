import React from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import ClientOrdersMobileLayout from './mobile/ClientOrdersMobileLayout';
import ClientOrdersDesktopLayout from './desktop/ClientOrdersDesktopLayout';

const WEB_DESKTOP_BREAKPOINT = 1024;

export default function ClientOrdersScreen() {
  const { width } = useWindowDimensions();

  if (Platform.OS === 'web' && width >= WEB_DESKTOP_BREAKPOINT) {
    return <ClientOrdersDesktopLayout />;
  }

  return <ClientOrdersMobileLayout />;
}
