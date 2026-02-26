import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  useWindowDimensions,
  GestureResponderEvent,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppealStatus } from '@/src/entities/appeal/types';

type Props = {
  visible: boolean;
  current: AppealStatus;
  allowed?: AppealStatus[];
  onSelect: (s: AppealStatus, e?: GestureResponderEvent) => void;
  onClose: () => void;
};

const ALL: AppealStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'COMPLETED', 'DECLINED'];
const labels: Record<AppealStatus, string> = {
  OPEN: 'Открыто',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Завершено',
  DECLINED: 'Отклонено',
  RESOLVED: 'Ожидание подтверждения',
};

const descriptions: Record<AppealStatus, string> = {
  OPEN: 'Новая задача в очереди',
  IN_PROGRESS: 'Задача взята в работу',
  COMPLETED: 'Работа завершена исполнителем',
  DECLINED: 'Работа отклонена',
  RESOLVED: 'Ожидается подтверждение результата',
};

const icons: Record<AppealStatus, keyof typeof Ionicons.glyphMap> = {
  OPEN: 'sparkles-outline',
  IN_PROGRESS: 'construct-outline',
  COMPLETED: 'checkmark-done-outline',
  DECLINED: 'close-circle-outline',
  RESOLVED: 'hourglass-outline',
};

function statusColor(status: AppealStatus) {
  switch (status) {
    case 'OPEN':
      return '#4CAF50';
    case 'IN_PROGRESS':
      return '#2196F3';
    case 'RESOLVED':
      return '#9C27B0';
    case 'COMPLETED':
      return '#2DD4BF';
    case 'DECLINED':
      return '#F97316';
  }
}

export default function AppealStatusMenu({ visible, current, allowed, onSelect, onClose }: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const webDefaultCursorStyle = Platform.OS === 'web' ? ({ cursor: 'default' } as any) : null;
  const suppressNextBackdropCloseRef = React.useRef(false);
  const markModalInteractionStart = () => {
    suppressNextBackdropCloseRef.current = true;
  };
  const markModalInteractionEnd = () => {
    suppressNextBackdropCloseRef.current = false;
  };
  const modalContentGuardProps =
    Platform.OS === 'web'
      ? ({
          onMouseDownCapture: markModalInteractionStart,
          onMouseDown: markModalInteractionStart,
          onTouchStart: markModalInteractionStart,
          onMouseUp: markModalInteractionEnd,
          onTouchEnd: markModalInteractionEnd,
          onClick: (event: any) => {
            event.stopPropagation?.();
            markModalInteractionEnd();
          },
          onStartShouldSetResponderCapture: () => {
            markModalInteractionStart();
            return false;
          },
        } as any)
      : ({
          onTouchStart: markModalInteractionStart,
          onTouchEnd: markModalInteractionEnd,
          onStartShouldSetResponderCapture: () => {
            markModalInteractionStart();
            return false;
          },
        } as any);

  const data = useMemo(() => (allowed && allowed.length ? allowed : ALL), [allowed]);
  const modalWidth = Math.min(560, Math.max(300, windowWidth - 24));
  const modalHeight = Math.min(560, Math.max(360, windowHeight - 80));
  const handleBackdropPress = () => {
    if (suppressNextBackdropCloseRef.current) {
      suppressNextBackdropCloseRef.current = false;
      return;
    }
    onClose();
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
        <View
          style={[styles.card, webDefaultCursorStyle, { width: modalWidth, height: modalHeight }]}
          {...modalContentGuardProps}
        >
          <LinearGradient
            colors={['#E0E7FF', '#DBEAFE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.headerIconWrap}>
              <Ionicons name="sync-outline" size={18} color="#1D4ED8" />
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>Изменить статус</Text>
              <Text style={styles.headerSubtitle}>Выберите новое состояние обращения</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color="#334155" />
            </Pressable>
          </LinearGradient>

          <View style={styles.body}>
            <FlatList
              data={data}
              keyExtractor={(s) => s}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isCurrent = item === current;
                const itemColor = statusColor(item);

                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.row,
                      isCurrent && styles.rowCurrent,
                      pressed && !isCurrent && styles.rowPressed,
                    ]}
                    disabled={isCurrent}
                    onPress={(e) => onSelect(item, e)}
                  >
                    <View style={styles.rowLeft}>
                      <View
                        style={[
                          styles.rowIconWrap,
                          { borderColor: isCurrent ? '#93C5FD' : '#CBD5E1' },
                          isCurrent && styles.rowIconWrapCurrent,
                        ]}
                      >
                        <Ionicons
                          name={icons[item]}
                          size={15}
                          color={isCurrent ? '#1D4ED8' : '#475569'}
                        />
                        <View style={[styles.dot, { backgroundColor: itemColor }]} />
                      </View>
                      <View style={styles.rowTextWrap}>
                        <Text style={[styles.rowLabel, isCurrent && styles.rowLabelCurrent]}>
                          {labels[item]}
                        </Text>
                        <Text style={styles.rowDescription}>{descriptions[item]}</Text>
                      </View>
                    </View>
                    {isCurrent ? (
                      <View style={styles.currentTag}>
                        <Text style={styles.currentTagText}>Текущий</Text>
                      </View>
                    ) : (
                      <Ionicons name="chevron-forward-outline" size={17} color="#94A3B8" />
                    )}
                  </Pressable>
                );
              }}
            />
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Отмена</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.38)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    maxWidth: 560,
    maxHeight: '92%',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  header: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#BFDBFE',
  },
  headerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: 'rgba(255,255,255,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '500',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  listContent: {
    gap: 8,
    paddingBottom: 8,
  },
  row: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rowPressed: {
    opacity: 0.9,
  },
  rowCurrent: {
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
  },
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconWrapCurrent: {
    backgroundColor: '#DBEAFE',
  },
  dot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fff',
  },
  rowTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowLabel: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  rowLabelCurrent: {
    color: '#1D4ED8',
  },
  rowDescription: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
  },
  currentTag: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  currentTagText: {
    color: '#1E3A8A',
    fontSize: 11,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  cancelBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
});
