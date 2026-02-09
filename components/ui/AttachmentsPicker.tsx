// components/ui/AttachmentsPicker.tsx
import React, { useCallback } from 'react';
import { Alert, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

export type AttachmentFile = {
  uri: string;
  name: string;
  type: string;
  file?: any;
  size?: number;
  lastModified?: number;
};

function normalizeNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function fileSignature(file: AttachmentFile) {
  const name = file.name || '';
  const type = file.type || '';
  const size = normalizeNumber(file.size ?? file.file?.size);
  const lastModified = normalizeNumber(file.lastModified ?? file.file?.lastModified);
  if (size !== undefined || lastModified !== undefined) {
    return `${name}|${size ?? ''}|${lastModified ?? ''}|${type}`;
  }
  return `${name}|${type}|${file.uri}`;
}

function dedupeFiles(files: AttachmentFile[]) {
  const seen = new Set<string>();
  const next: AttachmentFile[] = [];
  files.forEach((f) => {
    const sig = fileSignature(f);
    if (seen.has(sig)) return;
    seen.add(sig);
    next.push(f);
  });
  return next;
}

type Props = {
  value?: AttachmentFile[];
  onChange: (next: AttachmentFile[]) => void;

  addLabel?: string;
  accept?: string | string[];
  multiple?: boolean;
  maxFiles?: number;

  style?: StyleProp<ViewStyle>;
  showChips?: boolean;
  horizontal?: boolean;
};

export default function AttachmentsPicker({
  value = [],
  onChange,
  addLabel = 'Добавить файлы',
  accept = '*/*',
  multiple = true,
  maxFiles,
  style,
  showChips = true,
  horizontal = false,
}: Props) {
  const handlePick = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        multiple,
        copyToCacheDirectory: true,
        type: accept as any,
      });

      const anyRes: any = res as any;
      const canceled = anyRes.canceled === true || anyRes.type === 'cancel';
      if (canceled) return;

      const assets: any[] = anyRes.assets ?? (anyRes.type === 'success' || anyRes.uri ? [anyRes] : []);
      if (!assets?.length) return;

      const mapped: AttachmentFile[] = assets
        .filter((a) => a && a.uri)
        .map((a) => {
          const file = (a as any).file;
          const size = normalizeNumber((a as any).size ?? file?.size);
          const lastModified = normalizeNumber((a as any).lastModified ?? file?.lastModified);
          return {
            uri: a.uri,
            name: a.name || file?.name || 'file',
            type: a.mimeType || a.type || file?.type || 'application/octet-stream',
            file,
            size,
            lastModified,
          };
        });

      let next = dedupeFiles([...value, ...mapped]);
      if (typeof maxFiles === 'number') next = next.slice(0, maxFiles);
      onChange(next);
    } catch (e: any) {
      if (!DocumentPicker || typeof (DocumentPicker as any).getDocumentAsync !== 'function') {
        Alert.alert(
          'Модуль не доступен',
          'Похоже, expo-document-picker не установлен или приложение нужно пересобрать.\n' +
            'Выполните: npx expo install expo-document-picker, затем перезапустите с очисткой кэша.'
        );
        return;
      }
      console.error(e);
      Alert.alert('Ошибка', 'Не удалось выбрать файлы');
    }
  }, [accept, multiple, onChange, value, maxFiles]);

  const removeAt = useCallback(
    (idx: number) => {
      const next = value.filter((_, i) => i !== idx);
      onChange(next);
    },
    [onChange, value]
  );

  if (horizontal && !showChips) {
    return (
      <Pressable style={({ pressed }) => [styles.attachBtnSmall, pressed && { opacity: 0.9 }, style]} onPress={handlePick}>
        <Ionicons name="attach" size={16} color="#0B1220" />
      </Pressable>
    );
  }

  if (horizontal) {
    return (
      <ScrollView horizontal style={style} contentContainerStyle={styles.rowWrap} showsHorizontalScrollIndicator={false}>
        {showChips && value.map((f, idx) => (
          <View key={`${f.uri}-${idx}`} style={styles.fileChip}>
            <Ionicons name="document" size={14} color="#2563EB" />
            <Text style={styles.fileChipText}>{f.name}</Text>
            <Pressable onPress={() => removeAt(idx)} hitSlop={8}>
              <Ionicons name="close" size={14} color="#6B7280" />
            </Pressable>
          </View>
        ))}

        {(!maxFiles || value.length < maxFiles) && (
          <Pressable style={({ pressed }) => [styles.attachBtnSmall, pressed && { opacity: 0.9 }]} onPress={handlePick}>
            <Ionicons name="attach" size={16} color="#0B1220" />
          </Pressable>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={style}>
      {showChips && value.length > 0 && (
        <View style={styles.chipsWrap}>
          {value.map((f, idx) => (
            <View key={`${f.uri}-${idx}`} style={styles.fileChip}>
              <Ionicons name="document" size={14} color="#2563EB" />
              <Text style={styles.fileChipText}>{f.name}</Text>
              <Pressable onPress={() => removeAt(idx)} hitSlop={8}>
                <Ionicons name="close" size={14} color="#6B7280" />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Pressable style={({ pressed }) => [styles.attachBtn, pressed && { opacity: 0.9 }]} onPress={handlePick}>
        <Ionicons name="attach" size={16} color="#0B1220" />
        <Text style={styles.attachBtnText}>{addLabel}</Text>
        {typeof maxFiles === 'number' && (
          <Text style={styles.counterText}>
            {value.length}/{maxFiles}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  fileChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB',
    borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, maxWidth: '100%',
  },
  fileChipText: { maxWidth: 220, color: '#111827', fontSize: 12, lineHeight: 16, flexShrink: 1 },
  attachBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, alignSelf: 'flex-start', gap: 6,
  },
  attachBtnText: { color: '#0B1220', fontWeight: '700' },
  counterText: { marginLeft: 6, color: '#6B7280', fontSize: 12 },
  rowWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  attachBtnSmall: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
