import React from 'react';
import { Platform } from 'react-native';

type Props = {
  title: string;
  children: React.ReactNode;
};

export default function WebHoverTitle({ title, children }: Props) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return React.createElement('div', { title, style: { display: 'contents' } }, children);
}
