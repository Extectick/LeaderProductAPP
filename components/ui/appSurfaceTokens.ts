import {useTheme} from '@/context/ThemeContext';

/** Final prototype.css tokens; surface remains the incoming-message compatibility alias. */
export function appSurfaceTokens(dark: boolean) {
  const incoming = dark ? '#222B35' : '#FFFFFF';
  const panel = dark ? '#1E2730' : '#EEF2F7';
  return { dark, background: dark ? '#151B22' : '#F7F9FC', headerSurface: dark ? '#151B22' : '#FFFFFF', incoming, surface: incoming, panel, elevated: panel, soft: dark ? '#203043' : '#EAF2FF', text: dark ? '#F2F4F7' : '#18212D', muted: dark ? '#A6B0BE' : '#627185', line: dark ? '#33404E' : '#DCE3EC', accent: dark ? '#398DFF' : '#3289FF', accentText: dark ? '#68B0FF' : '#2563EB', outgoing: dark ? '#233F60' : '#E3EFFF', green: dark ? '#4ED888' : '#21864E', closedBackground: dark ? '#20262D' : '#F0F1F3', closedText: dark ? '#A4ADB8' : '#68717C', draftText: dark ? '#FF7C89' : '#D44956', danger: dark ? '#FF9393' : '#BD3636' };
}

const light=appSurfaceTokens(false),dark=appSurfaceTokens(true);
export function useAppSurfaceTheme(){return useTheme().theme==='dark'?dark:light;}
