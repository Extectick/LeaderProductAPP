// components/Appeals/AppealChatInput.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  Text,
  Animated,
  LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { MotiView, AnimatePresence } from 'moti';
import AttachmentsPicker, { AttachmentFile } from '@/components/ui/AttachmentsPicker';

export default function AppealChatInput({
  onSend,
  bottomInset = 0,
  onHeightChange,
}: {
  onSend: (payload: { text?: string; files?: AttachmentFile[] }) => Promise<void> | void;
  bottomInset?: number;
  onHeightChange?: (h: number) => void;
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<AttachmentFile[]>([]);
  const [sending, setSending] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showEmoji, setShowEmoji] = useState(false);
  const emojis = ['😀', '😂', '😍', '😎', '👍', '🙏'];

  const sendScale = useRef(new Animated.Value(1)).current;
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isRecording) {
      timer = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRecording]);

  useEffect(() => {
    return () => {
      if (recorder.isRecording) {
        recorder.stop().catch(() => {});
      }
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    };
  }, [recorder]);

  function animateIn(val: Animated.Value) {
    Animated.spring(val, { toValue: 0.9, useNativeDriver: true }).start();
  }

  function animateOut(val: Animated.Value) {
    Animated.spring(val, { toValue: 1, useNativeDriver: true }).start();
  }

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  async function startRecording() {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      setRecordingTime(0);
    } catch (e) {
      console.error(e);
    }
  }

  async function stopRecording() {
    try {
      if (!recorder.isRecording) return;
      await recorder.stop();
      setRecordedUri(recorder.uri || null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRecording(false);
      try {
        await setAudioModeAsync({ allowsRecording: false });
      } catch {}
    }
  }

  function cancelVoice() {
    setRecordedUri(null);
    setRecordingTime(0);
    void setAudioModeAsync({ allowsRecording: false });
  }

  function handleEmojiSelect(e: string) {
    setText((prev) => prev + e);
    setShowEmoji(false);
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

  async function handleSendVoice() {
    if (sending || !recordedUri) return;
    setSending(true);
    try {
      const voice: AttachmentFile = {
        uri: recordedUri,
        name: 'voice-message.m4a',
        type: 'audio/m4a',
      };
      await onSend({ files: [voice] });
      cancelVoice();
    } finally {
      setSending(false);
    }
  }

  const canSend = text.trim().length > 0 || files.length > 0;
  const actionIcon = recordedUri || canSend ? 'send' : 'mic';
  const actionBg = recordedUri || canSend ? '#2563EB' : '#E5E7EB';
  const actionColor = recordedUri || canSend ? '#fff' : '#2563EB';

  const handleActionPress = recordedUri
    ? handleSendVoice
    : canSend
    ? handleSend
    : undefined;

  const handleActionLongPress = !recordedUri && !canSend ? startRecording : undefined;
  const handleActionPressOut = () => {
    animateOut(sendScale);
    if (isRecording) stopRecording();
  };

  function handleLayout(e: LayoutChangeEvent) {
    onHeightChange?.(e.nativeEvent.layout.height);
  }

  return (
    <View style={[styles.wrapper, { paddingBottom: bottomInset }]} onLayout={handleLayout}>
      <View style={styles.inputRow}>
        <AttachmentsPicker
          value={files}
          onChange={setFiles}
          addLabel=""
          maxFiles={10}
          horizontal
          style={{ marginRight: 8 }}
        />
        {isRecording ? (
          <View style={styles.recordingBox}>
            <MotiView
              style={styles.wave}
              from={{ scaleY: 0.4 }}
              animate={{ scaleY: 1 }}
              transition={{ type: 'timing', duration: 500, loop: true }}
            />
            <Text style={styles.recordingTime}>{formatTime(recordingTime)}</Text>
          </View>
        ) : recordedUri ? (
          <View style={styles.voicePreview}>
            <Ionicons name="mic" size={20} color="#2563EB" />
            <Text style={styles.recordingTime}>{formatTime(recordingTime)}</Text>
            <Pressable onPress={cancelVoice} hitSlop={8} style={styles.cancelVoice}>
              <Ionicons name="close" size={16} color="#6B7280" />
            </Pressable>
          </View>
        ) : (
          <View style={styles.textWrapper}>
            <TextInput
              style={styles.input}
              multiline
              placeholder="Сообщение"
              placeholderTextColor="#9CA3AF"
              value={text}
              onChangeText={setText}
              onFocus={() => setShowEmoji(false)}
            />
            <Pressable
              onPress={() => setShowEmoji((v) => !v)}
              style={styles.emojiBtn}
              hitSlop={8}
            >
              <Ionicons name="happy-outline" size={20} color="#6B7280" />
            </Pressable>
          </View>
        )}

        <Pressable
          onPress={handleActionPress}
          onLongPress={handleActionLongPress}
          onPressIn={() => animateIn(sendScale)}
          onPressOut={handleActionPressOut}
          delayLongPress={200}
          disabled={sending}
          style={[styles.actionBtn, { backgroundColor: actionBg }, sending && { opacity: 0.5 }]}
          hitSlop={8}
        >
          <Animated.View style={{ transform: [{ scale: sendScale }] }}>
            <AnimatePresence exitBeforeEnter>
              <MotiView
                key={actionIcon}
                from={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: 'timing', duration: 150 }}
              >
                <Ionicons name={actionIcon} size={20} color={actionColor} />
              </MotiView>
            </AnimatePresence>
          </Animated.View>
        </Pressable>
      </View>
      {showEmoji && (
        <MotiView
          from={{ opacity: 0, translateY: 10 }}
          animate={{ opacity: 1, translateY: 0 }}
          exit={{ opacity: 0, translateY: 10 }}
          style={styles.emojiPicker}
        >
          {emojis.map((e) => (
            <Pressable key={e} onPress={() => handleEmojiSelect(e)} style={styles.emojiItem}>
              <Text style={styles.emojiText}>{e}</Text>
            </Pressable>
          ))}
        </MotiView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    padding: 8,
    backgroundColor: '#F9FAFB',
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    width: '100%',
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end' },
  actionBtn: {
    borderRadius: 20,
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 24,
    padding: 0,
    color: '#111827',
  },
  emojiBtn: { marginLeft: 4 },
  recordingBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 8,
  },
  wave: {
    width: 20,
    height: 20,
    marginRight: 8,
    backgroundColor: '#2563EB',
    borderRadius: 10,
  },
  recordingTime: { color: '#111827' },
  voicePreview: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 8,
    position: 'relative',
  },
  cancelVoice: { position: 'absolute', right: 6, top: 6 },
  emojiPicker: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  emojiItem: { marginHorizontal: 4 },
  emojiText: { fontSize: 24 },
});
