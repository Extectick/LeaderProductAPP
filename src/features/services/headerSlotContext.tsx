import React from 'react';

type ServicesHeaderSlotContextValue = {
  setHeaderBottomSlot: (slot: React.ReactNode | null) => void;
  setHeaderRightSlot: (slot: React.ReactNode | null) => void;
};

const noop = () => undefined;

const ServicesHeaderSlotContext = React.createContext<ServicesHeaderSlotContextValue>({
  setHeaderBottomSlot: noop,
  setHeaderRightSlot: noop,
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
