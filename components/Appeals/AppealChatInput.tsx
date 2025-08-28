// components/Appeals/AppealChatInput.tsx
import React, { useState, useRef, useEffect } from 'react';
import { View, TextInput, Pressable, StyleSheet, Text, Animated, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { MotiView } from 'moti';
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
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const sendScale = useRef(new Animated.Value(1)).current;
  const recordingRef = useRef<Audio.Recording | null>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isRecording) {
      timer = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRecording]);

  useEffect(() => {
    return () => {
      const rec = recordingRef.current;
      if (rec) {
        rec.stopAndUnloadAsync().catch(() => {});
        Audio.setAudioModeAsync({ allowsRecordingIOS: false, playThroughEarpieceAndroid: false }).catch(() => {});
      }
    };
  }, []);

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
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
      recordingRef.current = rec;
      setIsRecording(true);
      setRecordingTime(0);
    } catch (e) {
      console.error(e);
    }
  }

  async function stopRecording() {
    try {
      const rec = recording;
      if (!rec) return;
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      setRecordedUri(uri || null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRecording(false);
      setRecording(null);
      recordingRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playThroughEarpieceAndroid: false });
    }
  }

  function cancelVoice() {
    setRecordedUri(null);
    setRecordingTime(0);
    recordingRef.current = null;
    void Audio.setAudioModeAsync({ allowsRecordingIOS: false, playThroughEarpieceAndroid: false });
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
          <TextInput
            style={styles.input}
            multiline
            placeholder="Сообщение"
            placeholderTextColor="#9CA3AF"
            value={text}
            onChangeText={setText}
          />
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
            <Ionicons name={actionIcon} size={20} color={actionColor} />
          </Animated.View>
        </Pressable>
      </View>
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
    marginRight: 8,
  },
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
});
