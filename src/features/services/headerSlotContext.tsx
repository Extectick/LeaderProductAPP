import React from 'react';

export type ServicesHeaderOverride = {
  title?: string;
  subtitle?: string;
  icon?: string;
  showBack?: boolean;
  onBack?: () => void;
  compact?: boolean;
  dense?: boolean;
  tight?: boolean;
  horizontalPadding?: number;
  rightSlot?: React.ReactNode;
  bottomSlot?: React.ReactNode;
  surfaceVisible?: boolean;
  entranceMotion?: 'slide' | 'fade' | 'none';
  variant?: 'default' | 'document';
  showServerStatus?: boolean;
};

type ServicesHeaderSlotContextValue = {
  setHeaderBottomSlot: (slot: React.ReactNode | null) => void;
  setHeaderRightSlot: (slot: React.ReactNode | null) => void;
  setHeaderOverride: (override: ServicesHeaderOverride | null) => void;
};

const noop = () => undefined;

const ServicesHeaderSlotContext = React.createContext<ServicesHeaderSlotContextValue>({
  setHeaderBottomSlot: noop,
  setHeaderRightSlot: noop,
  setHeaderOverride: noop,
});

export function ServicesHeaderSlotProvider({
  value,
  children,
}: {
  value: ServicesHeaderSlotContextValue;
  children: React.ReactNode;
}) {
  return <ServicesHeaderSlotContext.Provider value={value}>{children}</ServicesHeaderSlotContext.Provider>;
}

export function useServicesHeaderSlot() {
  return React.useContext(ServicesHeaderSlotContext);
}
