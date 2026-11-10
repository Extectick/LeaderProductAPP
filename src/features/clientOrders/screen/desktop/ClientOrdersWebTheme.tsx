import React from 'react';
import { Box, ThemeProvider, createTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useAppSurfaceTheme } from '@/components/ui/appSurfaceTokens';

/** Bridge the desktop forms (including their portals) to the app/Help surfaces. */
export function ClientOrdersWebTheme({ children }: { children: React.ReactNode }) {
  const colors = useAppSurfaceTheme();
  const variables = React.useMemo(() => ({
    '--co-surface': colors.surface,
    '--co-background': colors.background,
    '--co-panel': colors.panel,
    '--co-text': colors.text,
    '--co-muted': colors.muted,
    '--co-line': colors.line,
    '--co-accent': colors.accentText,
    '--co-soft': colors.soft,
    '--co-danger': colors.danger,
    '--co-danger-soft': alpha(colors.danger, colors.dark ? 0.14 : 0.07),
    '--co-danger-line': alpha(colors.danger, 0.32),
    '--co-success': colors.green,
    '--co-success-soft': alpha(colors.green, 0.12),
    '--co-warning': colors.dark ? '#F3BE68' : '#946014',
    '--co-warning-soft': colors.dark ? '#3A3022' : '#FFF6E4',
    '--co-header': alpha(colors.headerSurface, 0.84),
    colorScheme: colors.dark ? 'dark' : 'light',
  }), [colors]);
  const theme = React.useMemo(() => createTheme({
    palette: {
      mode: colors.dark ? 'dark' : 'light',
      primary: { main: colors.accent, contrastText: '#FFFFFF' },
      secondary: { main: colors.accent, contrastText: '#FFFFFF' },
      background: { default: colors.background, paper: colors.surface },
      text: { primary: colors.text, secondary: colors.muted },
      divider: colors.line,
      error: { main: colors.danger },
      success: { main: colors.green },
    },
    typography: { fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: 14, fontWeightBold: 700, button: { textTransform: 'none', fontWeight: 600, fontSize: 14 } },
    shape: { borderRadius: 12 },
    components: {
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { minHeight: 40, borderRadius: 24, paddingInline: 16 } } },
      MuiIconButton: { styleOverrides: { root: { color: colors.muted } } },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12, fontSize: 14, backgroundColor: colors.surface }, notchedOutline: { borderColor: colors.line }, input: { paddingBlock: 10 } } },
      MuiInputLabel: { styleOverrides: { root: { color: colors.muted } } },
      MuiChip: { styleOverrides: { root: { borderRadius: 24, fontWeight: 600, fontSize: 12 } } },
      MuiMenuItem: { styleOverrides: { root: { minHeight: 44, fontSize: 14, borderRadius: 8 } } },
      MuiDialog: { styleOverrides: { root: variables, paper: { borderRadius: 24 } } },
      MuiDrawer: { styleOverrides: { root: variables, paper: { backgroundImage: 'none' } } },
      MuiPopover: { styleOverrides: { root: variables, paper: { borderRadius: 16, border: `1px solid ${colors.line}`, boxShadow: `0 12px 36px ${alpha('#000000', colors.dark ? 0.3 : 0.12)}` } } },
      MuiPopper: { styleOverrides: { root: variables } },
      MuiTooltip: { styleOverrides: { popper: variables } },
    },
  }), [colors, variables]);
  return <ThemeProvider theme={theme}><Box sx={{ ...variables, display: 'contents' }}>{children}</Box></ThemeProvider>;
}
