import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useServerStatus } from '@/src/shared/network/useServerStatus';
import { API_BASE_URL } from '@/utils/config';

export default function ServerStatusIndicator() {
  const { isReachable, lastReason, lastChangedAt, lastReachableAt, lastUnavailableAt } = useServerStatus();
  const [modalVisible, setModalVisible] = useState(false);
  const warn = useThemeColor({}, 'warning' as any) || '#D97706';
  const text = useThemeColor({}, 'text');

  const formatDateTime = useMemo(
    () => (timestamp?: number | null) => {
      if (!timestamp || !Number.isFinite(timestamp)) return '—';
      try {
        return new Date(timestamp).toLocaleString();
      } catch {
        return '—';
      }
    },
    []
  );

  if (isReachable) return null;

  return (
    <>
      <Pressable
        onPress={() => setModalVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Информация о соединении с сервером"
        style={({ pressed }) => [
          styles.wrap,
          { borderColor: `${warn}66`, backgroundColor: `${warn}14` },
          pressed ? styles.wrapPressed : null,
        ]}
      >
        <Ionicons name="cloud-offline-outline" size={16} color={warn} />
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setModalVisible(false)}>
          <Pressable
            onPress={(event) => event.stopPropagation?.()}
            style={[styles.card, { borderColor: `${warn}55` }]}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconWrap, { backgroundColor: `${warn}20`, borderColor: `${warn}55` }]}>
                <Ionicons name="alert-circle-outline" size={18} color={warn} />
              </View>
              <Text style={[styles.title, { color: text }]}>Сервер недоступен</Text>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={({ pressed }) => [styles.closeBtn, pressed ? styles.closeBtnPressed : null]}
              >
                <Ionicons name="close-outline" size={18} color="#64748B" />
              </Pressable>
            </View>

            <View style={styles.rows}>
              <InfoRow label="Статус" value="Нет соединения" />
              <InfoRow label="API адрес" value={API_BASE_URL || '—'} />
              <InfoRow label="Причина" value={lastReason || '—'} />
              <InfoRow label="Последнее успешное подключение" value={formatDateTime(lastReachableAt)} />
              <InfoRow label="Потеря соединения" value={formatDateTime(lastUnavailableAt)} />
              <InfoRow label="Последнее изменение статуса" value={formatDateTime(lastChangedAt)} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrapPressed: {
    opacity: 0.86,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPressed: {
    opacity: 0.85,
  },
  rows: {
    gap: 8,
  },
  infoRow: {
    gap: 2,
  },
  infoLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
  },
  infoValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
});
