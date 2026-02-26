import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, TouchableOpacity, View } from 'react-native';

import { MaxMessengerSignLogo } from './constants';
import { getAuthScreenStyles } from './styles';
import type { MessengerQrAuthProvider } from '@/types/apiTypes';

type AuthScreenStyles = ReturnType<typeof getAuthScreenStyles>;

type Props = {
  providers: MessengerQrAuthProvider[];
  outerW: number;
  styles: AuthScreenStyles;
  onOpen: (provider: MessengerQrAuthProvider) => Promise<void>;
};

export default function AuthDesktopQrProviders({ providers, outerW, styles, onOpen }: Props) {
  if (!providers.length) return null;

  return (
    <View style={[styles.desktopProviderWrap, { maxWidth: outerW }]}>
      <Text style={styles.desktopProviderTitle}>Быстрый вход</Text>
      <View style={styles.desktopProviderRow}>
        {providers.includes('TELEGRAM') && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Войти через Telegram по QR"
            activeOpacity={0.85}
            style={[styles.desktopProviderBtn, styles.telegramProviderBtn]}
            onPress={() => {
              void onOpen('TELEGRAM');
            }}
          >
            <Ionicons name="paper-plane" size={20} color="#FFFFFF" />
            <Text style={styles.desktopProviderBtnText}>Telegram</Text>
          </TouchableOpacity>
        )}

        {providers.includes('MAX') && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Войти через MAX по QR"
            activeOpacity={0.85}
            style={[styles.desktopProviderBtn, styles.maxProviderBtn]}
            onPress={() => {
              void onOpen('MAX');
            }}
          >
            <MaxMessengerSignLogo width={18} height={18} style={styles.maxProviderIcon} />
            <Text style={styles.desktopProviderBtnText}>MAX</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
