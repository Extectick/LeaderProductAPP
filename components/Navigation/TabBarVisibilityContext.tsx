import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type TabBarVisibilityContextValue = {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
};

const TabBarVisibilityContext = createContext<TabBarVisibilityContextValue | null>(null);

export function TabBarVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHiddenState] = useState(false);

  const setHidden = useCallback((nextHidden: boolean) => {
    setHiddenState(nextHidden);
  }, []);

  const value = useMemo(
    () => ({
      hidden,
      setHidden,
    }),
    [hidden, setHidden]
  );

  return <TabBarVisibilityContext.Provider value={value}>{children}</TabBarVisibilityContext.Provider>;
}

export function useTabBarVisibility() {
  const value = useContext(TabBarVisibilityContext);
  if (!value) {
    throw new Error('useTabBarVisibility must be used within TabBarVisibilityProvider');
  }
  return value;
}

export function useOptionalTabBarVisibility() {
  return useContext(TabBarVisibilityContext);
}
