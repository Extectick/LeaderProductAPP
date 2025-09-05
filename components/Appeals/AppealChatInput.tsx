// components/Appeals/AppealChatInput.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  Text,
  Animated as RNAnimated,
  LayoutChangeEvent,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { MotiView, AnimatePresence } from 'moti';
import AttachmentsPicker, { AttachmentFile } from '@/components/ui/AttachmentsPicker';
import { PanGestureHandler } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedGestureHandler,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

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
  const [showEmoji, setShowEmoji] = useState(false);
  const emojis = ['😀', '😂', '😍', '😎', '👍', '🙏'];

  const sendScale = useRef(new RNAnimated.Value(1)).current;
  const recordingRef = useRef<Audio.Recording | null>(null);

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
      const rec = recordingRef.current;
      if (rec) {
        rec.stopAndUnloadAsync().catch(() => {});
        Audio.setAudioModeAsync({ allowsRecordingIOS: false, playThroughEarpieceAndroid: false }).catch(() => {});
      }
    };
  }, []);

  function animateIn(val: RNAnimated.Value) {
    RNAnimated.spring(val, { toValue: 0.9, useNativeDriver: true }).start();
  }

  function animateOut(val: RNAnimated.Value) {
    RNAnimated.spring(val, { toValue: 1, useNativeDriver: true }).start();
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
    setIsRecording(false);
    recordingRef.current = null;
    void Audio.setAudioModeAsync({ allowsRecordingIOS: false, playThroughEarpieceAndroid: false });
  }

  function handleEmojiSelect(e: string) {
    setText((prev) => prev + e);
    setShowEmoji(false);
  }

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

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

  const panX = useSharedValue(0);
  const panGesture = useAnimatedGestureHandler({
    onActive: (e: any) => {
      if (isRecording) panX.value = e.translationX;
    },
    onEnd: (e: any) => {
      if (isRecording && e.translationX < -80) runOnJS(cancelVoice)();
      panX.value = withTiming(0);
    },
  });
  const panStyle = useAnimatedStyle(() => ({ transform: [{ translateX: panX.value }] }));

  function handleLayout(e: LayoutChangeEvent) {
    onHeightChange?.(e.nativeEvent.layout.height);
  }

  return (
    <View style={[styles.wrapper, { paddingBottom: bottomInset }]} onLayout={handleLayout}>
      {files.length > 0 && (
        <ScrollView
          horizontal
          style={styles.previewRow}
          contentContainerStyle={{ alignItems: 'center' }}
          showsHorizontalScrollIndicator={false}
        >
          {files.map((f, idx) => (
            <View key={`${f.uri}-${idx}`} style={styles.previewItem}>
              {f.type.startsWith('image/') ? (
                <Image source={{ uri: f.uri }} style={styles.previewImage} />
              ) : (
                <Ionicons name="document" size={32} color="#6B7280" />
              )}
              <Pressable onPress={() => removeFile(idx)} style={styles.removePreview} hitSlop={8}>
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={styles.inputRow}>
        <AttachmentsPicker
          value={files}
          onChange={setFiles}
          addLabel=""
          maxFiles={10}
          horizontal
          showChips={false}
          style={{ marginRight: 6 }}
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
            <Text style={styles.swipeHint}>Свайп для отмены</Text>
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

        <PanGestureHandler onGestureEvent={panGesture}>
          <Animated.View style={panStyle}>
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
              <RNAnimated.View style={{ transform: [{ scale: sendScale }] }}>
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
              </RNAnimated.View>
            </Pressable>
          </Animated.View>
        </PanGestureHandler>
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
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#F9FAFB',
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    width: '100%',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  actionBtn: {
    borderRadius: 20,
    padding: 8,
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
    paddingVertical: 2,
    marginRight: 6,
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
    paddingVertical: 4,
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
  swipeHint: { marginLeft: 8, color: '#6B7280', fontSize: 12 },
  voicePreview: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingVertical: 4,
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
  previewRow: { flexDirection: 'row', marginBottom: 6 },
  previewItem: {
    width: 56,
    height: 56,
    borderRadius: 10,
    marginRight: 8,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  previewImage: { width: '100%', height: '100%', borderRadius: 10 },
  removePreview: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#6B7280',
    borderRadius: 12,
    padding: 2,
  },
});
