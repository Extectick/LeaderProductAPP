// V:\lp\components\Appeals\AppealStatusMenu.tsx
import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  GestureResponderEvent,
} from 'react-native';
import { AppealStatus } from '@/types/appealsTypes';

type Props = {
  visible: boolean;
  current: AppealStatus;
  onSelect: (s: AppealStatus, e?: GestureResponderEvent) => void;
  onClose: () => void;
};

const ALL: AppealStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const labels: Record<AppealStatus, string> = {
  OPEN: 'Открыто',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Выполнено',
  DECLINED: 'Отклонено',
  RESOLVED: 'Решено',
  CLOSED: 'Закрыто',
};

function statusColor(status: AppealStatus) {
  switch (status) {
    case 'OPEN': return '#4CAF50';
    case 'IN_PROGRESS': return '#2196F3';
    case 'RESOLVED': return '#9C27B0';
    case 'CLOSED': return '#9E9E9E';
  }
}

export default function AppealStatusMenu({ visible, current, onSelect, onClose }: Props) {
  const data = useMemo(() => ALL, []);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} style={styles.backdrop} onPress={onClose}>
        <View />
      </TouchableOpacity>

      <View style={styles.sheet}>
        <Text style={styles.title}>Изменить статус</Text>
        <FlatList
          data={data}
          keyExtractor={(s) => s}
          renderItem={({ item }) => {
            const isCurrent = item === current;
            return (
              <TouchableOpacity
                style={[styles.row, isCurrent && styles.rowCurrent]}
                disabled={isCurrent}
                onPress={(e) => onSelect(item, e)}
              >
                <View style={[styles.dot, { backgroundColor: statusColor(item) }]} />
                <Text style={[styles.label, isCurrent && styles.labelCurrent]}>
                  {labels[item]}
                </Text>
                {isCurrent ? <Text style={styles.currentTag}>текущий</Text> : null}
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />

        <TouchableOpacity style={styles.cancel} onPress={onClose}>
          <Text style={styles.cancelText}>Отмена</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    position: 'absolute',
    left: 16, right: 16, bottom: 24,
    borderRadius: 14, padding: 12,
    backgroundColor: '#fff', shadowColor: '#000',
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10 },
  rowCurrent: { backgroundColor: '#F5F7FA' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  label: { fontSize: 15, color: '#222', flex: 1 },
  labelCurrent: { color: '#666' },
  currentTag: { fontSize: 12, color: '#888' },
  sep: { height: 1, backgroundColor: '#EEE' },
  cancel: { marginTop: 10, alignSelf: 'flex-end', paddingHorizontal: 8, paddingVertical: 6 },
  cancelText: { color: '#007AFF', fontSize: 15, fontWeight: '600' },
});
