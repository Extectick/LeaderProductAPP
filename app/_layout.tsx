import LayoutWithAuth from '@/components/LayoutWithAuth';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { StatusBar } from 'react-native';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle="dark-content"
        />
        <LayoutWithAuth>
          {null}
        </LayoutWithAuth>
      </AuthProvider>
    </ThemeProvider>
  );
}
