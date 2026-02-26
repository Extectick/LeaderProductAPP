import { Platform, StyleSheet } from 'react-native';

import { CARD_PAD_H } from './constants';

export type AuthScreenColors = {
  text: string;
  background: string;
  tint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
  inputBackground: string;
  inputBorder: string;
  button: string;
  buttonText: string;
  buttonDisabled: string;
  secondaryText: string;
  error: string;
  success: string;
  warning: string;
  info: string;
  disabledText: string;
  disabledBackground: string;
  cardBackground: string;
  placeholder: string;
  shadow: string;
  expired: string;
  card: string;
  border: string;
};

export const getAuthScreenStyles = (colors: AuthScreenColors) =>
  StyleSheet.create({
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 0,
    },
    header: {
      width: '100%',
      maxWidth: Platform.OS === 'web' ? 820 : 620,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    logoWrap: {
      backgroundColor: 'rgba(255,255,255,0.92)',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.14,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },

    segmentWrapper: { width: '100%', alignItems: 'center', marginBottom: 10 },
    segment: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: 'rgba(255,255,255,0.7)',
      borderRadius: 16,
      padding: 4,
      flexDirection: 'row',
      overflow: 'hidden',
      ...Platform.select({ web: { backdropFilter: 'blur(8px)' } }),
    },
    segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
    segmentText: { fontWeight: '700', color: '#4b5563' },
    segmentTextActive: { color: '#111827' },
    segmentPill: { position: 'absolute', top: 4, bottom: 4, borderRadius: 12, backgroundColor: '#fff' },

    errorWrap: {
      maxWidth: 420,
      width: '100%',
      backgroundColor: `${colors.error}22`,
      borderColor: colors.error,
      borderWidth: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      marginBottom: 10,
    },
    errorText: { color: colors.error, textAlign: 'center', fontWeight: '700' },
    noticeWrap: {
      maxWidth: 420,
      width: '100%',
      borderWidth: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      marginBottom: 10,
    },
    noticeText: { textAlign: 'center', fontWeight: '700' },

    topBlock: {
      justifyContent: 'flex-start',
    },
    card: {
      backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.85)' : colors.cardBackground,
      borderRadius: 20,
      padding: CARD_PAD_H,
      overflow: 'hidden',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.18,
          shadowRadius: 16,
        },
        android: { elevation: 8 },
        web: { backdropFilter: 'blur(10px)', boxShadow: '0px 12px 24px rgba(0,0,0,0.15)' },
      }),
    },

    slide: { paddingBottom: Platform.OS === 'web' ? 8 : 4, paddingHorizontal: 0 },

    title: { fontSize: 26, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 14 },

    fieldCompact: { width: '100%', alignSelf: 'stretch', marginBottom: 10 },
    loginPasswordFieldCompact: { marginBottom: 0 },

    loginFooterRow: {
      width: '100%',
      marginTop: 20,
      marginBottom: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
    },
    rememberInline: {
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
      borderRadius: 12,
      paddingHorizontal: 0,
      paddingVertical: 2,
    },
    rememberInlinePressed: {
      opacity: 0.9,
    },
    rememberInlineText: {
      color: colors.secondaryText,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
      flexShrink: 1,
      marginLeft: 2,
      includeFontPadding: true,
    },
    forgotInlineLink: { flexShrink: 1, alignItems: 'flex-end' },

    buttonWrap: {
      width: '100%',
      alignSelf: 'stretch',
      overflow: 'hidden',
      borderRadius: 16,
      marginTop: 0,
      marginBottom: 0,
    },
    fill: { flex: 1 },
    linkText: {
      fontSize: 14,
      fontWeight: '700',
      textDecorationLine: 'underline',
      color: colors.tint,
    },

    secondary: { color: colors.secondaryText, fontSize: 14 },

    strengthRow: { flexDirection: 'row', alignItems: 'center', marginTop: -4, marginBottom: 8 },
    strengthBg: { height: 8, backgroundColor: '#00000020', borderRadius: 6, flex: 1, overflow: 'hidden' },
    strengthFill: { height: 8, borderRadius: 6 },

    otpActionsRow: {
      width: '100%',
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      flexWrap: 'wrap',
    },
    telegramFloatingBtn: {
      position: 'absolute',
      right: 14,
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#229ED9',
      shadowColor: '#0F172A',
      shadowOpacity: 0.25,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 16,
      elevation: 8,
      zIndex: 20,
    },
    buildInfo: {
      marginTop: 12,
      marginBottom: 28,
      width: '100%',
      maxWidth: 420,
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 8,
    },
    buildInfoText: {
      width: '100%',
      fontSize: 12,
      lineHeight: 17,
      color: colors.secondaryText,
      opacity: 0.8,
      textAlign: 'center',
      flexShrink: 1,
    },
    desktopProviderWrap: {
      width: '100%',
      marginTop: 14,
      marginBottom: 2,
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    desktopProviderTitle: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
      color: colors.secondaryText,
      opacity: 0.9,
      marginBottom: 8,
      textAlign: 'center',
    },
    desktopProviderRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      flexWrap: 'wrap',
    },
    desktopProviderBtn: {
      minWidth: 140,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 11,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    telegramProviderBtn: {
      backgroundColor: '#229ED9',
    },
    maxProviderBtn: {
      backgroundColor: '#2E60F0',
    },
    maxProviderIcon: {
      width: 18,
      height: 18,
      borderRadius: 4,
      backgroundColor: 'transparent',
    },
    desktopProviderBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '800',
    },
    qrModalOverlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 18,
    },
    qrModalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(15, 23, 42, 0.56)',
    },
    qrModalCard: {
      width: '100%',
      maxWidth: 420,
      borderRadius: 20,
      padding: 18,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      shadowColor: '#0F172A',
      shadowOpacity: 0.28,
      shadowOffset: { width: 0, height: 10 },
      shadowRadius: 24,
      elevation: 12,
    },
    qrModalHeader: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 14,
      backgroundColor: '#1E3A8A',
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    qrModalProviderIcon: {
      width: 20,
      height: 20,
      borderRadius: 4,
      backgroundColor: 'transparent',
    },
    qrModalTitle: {
      color: '#FFFFFF',
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '800',
      textAlign: 'center',
      flexShrink: 1,
    },
    qrBox: {
      width: 252,
      height: 252,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
      backgroundColor: '#FFFFFF',
    },
    qrNoticeText: {
      width: '100%',
      textAlign: 'center',
      color: '#1F2937',
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
      marginBottom: 8,
    },
    qrErrorText: {
      width: '100%',
      textAlign: 'center',
      color: colors.error,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
      marginBottom: 8,
    },
    qrModalActions: {
      width: '100%',
      gap: 8,
      marginTop: 2,
    },
    qrActionBtn: {
      width: '100%',
      borderRadius: 12,
      paddingVertical: 11,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    qrActionPrimary: {
      backgroundColor: '#1D4ED8',
      borderColor: '#1D4ED8',
    },
    qrActionPrimaryText: {
      color: '#FFFFFF',
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '800',
      textAlign: 'center',
    },
    qrActionSecondary: {
      backgroundColor: '#FFFFFF',
      borderColor: '#CBD5E1',
    },
    qrActionSecondaryText: {
      color: '#1F2937',
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '700',
      textAlign: 'center',
    },
    qrActionCancel: {
      backgroundColor: '#FFFFFF',
      borderColor: '#E11D48',
    },
    qrActionCancelText: {
      color: '#BE123C',
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '800',
      textAlign: 'center',
    },
    qrActionDisabled: {
      opacity: 0.55,
    },
  });
