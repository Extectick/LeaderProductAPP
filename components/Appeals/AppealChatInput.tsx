// components/Appeals/AppealChatInput.tsx
import React, { useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { AttachmentFile } from '@/components/ui/AttachmentsPicker';

export default function AppealChatInput({
  onSend,
}: {
  onSend: (payload: { text?: string; files?: AttachmentFile[] }) => Promise<void> | void;
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<AttachmentFile[]>([]);
  const [sending, setSending] = useState(false);

  async function pickFiles() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      const anyRes: any = res as any;
      const canceled = anyRes.canceled === true || anyRes.type === 'cancel';
      if (canceled) return;
      const assets: any[] = anyRes.assets ?? (anyRes.type === 'success' || anyRes.uri ? [anyRes] : []);
      if (!assets?.length) return;
      const mapped: AttachmentFile[] = assets
        .filter((a) => a && a.uri)
        .map((a) => ({ uri: a.uri, name: a.name || 'file', type: a.mimeType || a.type || 'application/octet-stream' }));
      setFiles((prev) => [...prev, ...mapped]);
    } catch (e) {
      console.error(e);
    }
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSend() {
    if (sending || (!text.trim() && files.length === 0)) return;
    setSending(true);
    try {
      await onSend({ text: text.trim() || undefined, files });
      setText('');
      setFiles([]);
    } finally {
      setSending(false);
    }
  }

  const canSend = text.trim().length > 0 || files.length > 0;

  return (
    <View style={styles.wrapper}>
      {files.length > 0 && (
        <View style={styles.chipsWrap}>
          {files.map((f, idx) => (
            <View key={`${f.uri}-${idx}`} style={styles.fileChip}>
              <Ionicons name="document" size={14} color="#2563EB" />
              <Text style={styles.fileChipText} numberOfLines={1}>{f.name}</Text>
              <Pressable onPress={() => removeFile(idx)} hitSlop={8}>
                <Ionicons name="close" size={14} color="#6B7280" />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <View style={styles.inputRow}>
        <Pressable onPress={pickFiles} style={styles.attachBtn} hitSlop={8}>
          <Ionicons name="attach" size={22} color="#2563EB" />
        </Pressable>
        <TextInput
          style={styles.input}
          multiline
          placeholder="Сообщение"
          placeholderTextColor="#9CA3AF"
          value={text}
          onChangeText={setText}
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend || sending}
          style={({ pressed }) => [styles.sendBtn, (!canSend || sending || pressed) && { opacity: 0.5 }]}
          hitSlop={8}
        >
          <Ionicons name="send" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { padding: 8, backgroundColor: '#F9FAFB', borderTopWidth: 1, borderColor: '#E5E7EB' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  fileChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff',
    borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, maxWidth: '100%',
  },
  fileChipText: { maxWidth: 160, color: '#111827', fontSize: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end' },
  attachBtn: { padding: 6, justifyContent: 'center' },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    color: '#111827',
    marginHorizontal: 8,
  },
  sendBtn: { backgroundColor: '#2563EB', borderRadius: 20, padding: 10, justifyContent: 'center', alignItems: 'center' },
});
