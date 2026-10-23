import { useTheme } from '@/context/ThemeContext';
import { AccessibilityInfo } from 'react-native';
import { useEffect, useState } from 'react';

export function useHelpTheme() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  return { dark, background: dark ? '#151D23' : '#F4F7FA', surface: dark ? '#222C35' : '#FFFFFF', elevated: dark ? '#293743' : '#EAF0F6', text: dark ? '#F0F3F6' : '#172633', muted: dark ? '#A6B4C1' : '#637A8C', line: dark ? '#344453' : '#DCE5ED', accent: '#338BFF', accentText: dark ? '#74BAFF' : '#1973CA', outgoing: dark ? '#244565' : '#DCEEFF', danger: dark ? '#FF9393' : '#BD3636' };
}
export type HelpTheme = ReturnType<typeof useHelpTheme>;
export function useHelpReducedMotion() {
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{let alive=true;void Promise.resolve(AccessibilityInfo.isReduceMotionEnabled()).then(value=>{if(alive)setReduced(Boolean(value));});const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);return()=>{alive=false;sub.remove();};},[]);
  return reduced;
}
