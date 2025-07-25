import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ensureAuth } from '../utils/auth';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const token = await ensureAuth();
        setIsAuthenticated(!!token);
      } catch {
        setIsAuthenticated(false);
      }
    }
    checkAuth();
  }, []);

  if (isAuthenticated === null) {
    return null; // Показываем пустой экран во время проверки
  }

  if (!isAuthenticated) {
    return <Redirect href="/AuthScreen" />;
  }

  return <>{children}</>;
}
