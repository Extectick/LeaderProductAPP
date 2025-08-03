import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { Redirect, Slot, usePathname } from 'expo-router';
import { StatusBar } from 'react-native';

function InnerLayout() {
  useAuthRedirect(); // теперь это ВНУТРИ AuthProvider

  const pathname = usePathname();

  if (pathname === '/' || pathname === '') {
    return <Redirect href="/HomeScreen" />;
  }

  return <Slot />;
}

export default function RootLayout() {
  
  return (
    <ThemeProvider>
      <AuthProvider>
        <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
        <InnerLayout />
      </AuthProvider>
    </ThemeProvider>
  );
}
