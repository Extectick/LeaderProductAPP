import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import ThemedLoader from '@/components/ui/ThemedLoader';
import type { MessengerQrAuthProvider } from '@/types/apiTypes';
import { MaxMessengerSignLogo } from './constants';
import { getAuthScreenStyles } from './styles';
import { providerLabel } from './utils';

type AuthScreenStyles = ReturnType<typeof getAuthScreenStyles>;

type Props = {
  visible: boolean;
  provider: MessengerQrAuthProvider | null;
  qrBusy: boolean;
  qrPayload: string;
  qrNotice: string;
  qrError: string;
  qrDeepLinkUrl: string;
  styles: AuthScreenStyles;
  onClose: () => void;
  onOpenProviderApp: () => void;
  onRetry: () => void;
};

export default function AuthQrModal({
  visible,
  provider,
  qrBusy,
  qrPayload,
  qrNotice,
  qrError,
  qrDeepLinkUrl,
  styles,
  onClose,
  onOpenProviderApp,
  onRetry,
}: Props) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.qrModalOverlay}>
        <Pressable style={styles.qrModalBackdrop} onPress={onClose} />

        <View style={styles.qrModalCard}>
          <View style={styles.qrModalHeader}>
            {provider === 'MAX' ? (
              <MaxMessengerSignLogo width={20} height={20} style={styles.qrModalProviderIcon} />
            ) : (
              <Ionicons name="paper-plane" size={20} color="#FFFFFF" />
            )}
            <Text style={styles.qrModalTitle}>Вход через {provider ? providerLabel(provider) : ''}</Text>
          </View>

          <View style={styles.qrBox}>
            {qrBusy && <ThemedLoader size={22} />}
            {!qrBusy && !!qrPayload && <QRCode value={qrPayload} size={220} />}
          </View>

          {!!qrNotice && <Text style={styles.qrNoticeText}>{qrNotice}</Text>}
          {!!qrError && <Text style={styles.qrErrorText}>{qrError}</Text>}

          <View style={styles.qrModalActions}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.qrActionBtn, styles.qrActionPrimary, !qrDeepLinkUrl && styles.qrActionDisabled]}
              disabled={!qrDeepLinkUrl}
              onPress={onOpenProviderApp}
            >
              <Text style={styles.qrActionPrimaryText}>
                Открыть {provider ? providerLabel(provider) : 'мессенджер'}
              </Text>
            </TouchableOpacity>

            {provider && !!qrError && (
              <TouchableOpacity activeOpacity={0.85} style={[styles.qrActionBtn, styles.qrActionSecondary]} onPress={onRetry}>
                <Text style={styles.qrActionSecondaryText}>Создать новый QR</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity activeOpacity={0.85} style={[styles.qrActionBtn, styles.qrActionCancel]} onPress={onClose}>
              <Text style={styles.qrActionCancelText}>Отменить</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
