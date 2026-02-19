import React from 'react';

type NotificationViewportContextValue = {
  headerBottomOffset: number;
  setHeaderBottomOffset: (value: number) => void;
};

const NotificationViewportContext = React.createContext<NotificationViewportContextValue | null>(null);

export function NotificationViewportProvider({ children }: { children: React.ReactNode }) {
  const [headerBottomOffset, setHeaderBottomOffsetState] = React.useState(0);

  const setHeaderBottomOffset = React.useCallback((value: number) => {
    const next = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    setHeaderBottomOffsetState((prev) => (Math.abs(prev - next) <= 1 ? prev : next));
  }, []);

  const value = React.useMemo(
    () => ({
      headerBottomOffset,
      setHeaderBottomOffset,
    }),
    [headerBottomOffset, setHeaderBottomOffset]
  );

  return (
    <NotificationViewportContext.Provider value={value}>
      {children}
    </NotificationViewportContext.Provider>
  );
}

export function useNotificationViewport() {
  const ctx = React.useContext(NotificationViewportContext);
  if (!ctx) {
    return {
      headerBottomOffset: 0,
      setHeaderBottomOffset: () => undefined,
    };
  }
  return ctx;
}

