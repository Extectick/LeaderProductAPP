// components/Appeals/AppealChatInput.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  Text,
  Animated,
  LayoutChangeEvent,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { MotiView, AnimatePresence } from 'moti';
import AttachmentsPicker, { AttachmentFile } from '@/components/ui/AttachmentsPicker';
import { LiquidGlassSurface } from '@/components/ui/LiquidGlassSurface';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useTheme } from '@/context/ThemeContext';

export default function AppealChatInput({
  onSend,
  bottomInset = 0,
  onHeightChange,
  showScrollToBottom = false,
  onScrollToBottom,
  onInputFocus,
}: {
  onSend: (payload: { text?: string; files?: AttachmentFile[] }) => Promise<void> | void;
  bottomInset?: number;
  onHeightChange?: (h: number) => void;
  showScrollToBottom?: boolean;
  onScrollToBottom?: () => void;
  onInputFocus?: () => void;
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<AttachmentFile[]>([]);
  const [sending, setSending] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showEmoji, setShowEmoji] = useState(false);
  const [inputHeight, setInputHeight] = useState(20);
  const [inputScrollable, setInputScrollable] = useState(false);
  const emojis = ['😀', '😂', '😍', '😎', '👍', '🙏'];

  const sendScale = useRef(new Animated.Value(1)).current;
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const isRecordingRef = useRef(false);
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const pendingStopRef = useRef(false);
  const mountedRef = useRef(true);
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const textColor = useThemeColor({}, 'text');
  const tintColor = useThemeColor({}, 'tint');
  const borderColor = withOpacity(textColor, isDark ? 0.12 : 0.18);
  const surfaceColor = isDark ? 'rgba(17, 24, 39, 0.9)' : '#F3F4F6';
  const inputBg = isDark ? '#111827' : '#FFFFFF';
  const inputBorder = isDark ? '#334155' : '#E5E7EB';
  const textPrimary = isDark ? '#E2E8F0' : '#111827';
  const extraBottom = bottomInset;
  const lineHeight = 20;
  const maxLines = 4;
  const minInputHeight = lineHeight;
  const maxInputHeight = lineHeight * maxLines;

  function clampInputHeight(height: number) {
    return Math.max(minInputHeight, Math.min(height, maxInputHeight));
  }

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
      mountedRef.current = false;
    };
  }, []);

  const safeStop = useCallback(
    async (opts?: { saveUri?: boolean; clearOnAbort?: boolean }) => {
      if (isStoppingRef.current) return;
      if (!isRecordingRef.current && !isStartingRef.current) {
        try {
          await setAudioModeAsync({ allowsRecording: false });
        } catch {}
        if (mountedRef.current) setIsRecording(false);
        return;
      }

      if (isStartingRef.current && !isRecordingRef.current) {
        pendingStopRef.current = true;
        return;
      }

      isStoppingRef.current = true;
      try {
        if (isRecordingRef.current) {
          await recorder.stop();
          if (opts?.saveUri !== false && mountedRef.current) {
            setRecordedUri(recorder.uri || null);
          }
        } else if (opts?.clearOnAbort && mountedRef.current) {
          setRecordedUri(null);
        }
      } catch (e) {
        console.error(e);
      } finally {
        isRecordingRef.current = false;
        isStoppingRef.current = false;
        pendingStopRef.current = false;
        if (mountedRef.current) setIsRecording(false);
        try {
          await setAudioModeAsync({ allowsRecording: false });
        } catch {}
      }
    },
    [recorder]
  );

  useEffect(() => {
    return () => {
      // Avoid calling into a released native recorder on Android unmount.
      void safeStop({ saveUri: false, clearOnAbort: true });
    };
  }, [safeStop]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        void safeStop({ saveUri: false, clearOnAbort: true });
      };
    }, [safeStop])
  );

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

  async function ensureRecordingPermission() {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Нет доступа к микрофону', 'Разрешите доступ к микрофону в настройках приложения.');
        return false;
      }
      return true;
    } catch (e) {
      console.error(e);
      Alert.alert('Ошибка', 'Не удалось запросить доступ к микрофону.');
      return false;
    }
  }

  async function startRecording() {
    if (isStartingRef.current || isRecordingRef.current) return;
    isStartingRef.current = true;
    pendingStopRef.current = false;
    try {
      const ok = await ensureRecordingPermission();
      if (!ok) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (pendingStopRef.current) return;
      recorder.record();
      isRecordingRef.current = true;
      if (mountedRef.current) {
        setIsRecording(true);
        setRecordingTime(0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      isStartingRef.current = false;
      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        await safeStop({ saveUri: false, clearOnAbort: true });
      }
    }
  }

  async function stopRecording() {
    await safeStop({ saveUri: true });
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
      setInputHeight(minInputHeight);
      setInputScrollable(false);
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
  const actionBg = '#1E88E5';
  const actionColor = '#fff';

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

  function handleContentSizeChange(e: any) {
    const contentHeight = e.nativeEvent?.contentSize?.height ?? minInputHeight;
    const next = clampInputHeight(contentHeight);
    if (next !== inputHeight) setInputHeight(next);
    setInputScrollable(contentHeight > maxInputHeight + 1);
  }

  function handleTextChange(nextText: string) {
    setText(nextText);
  }

  return (
    <View style={[styles.wrapper, { paddingBottom: extraBottom }]} onLayout={handleLayout}>
      {showScrollToBottom && (
        <Pressable
          onPress={onScrollToBottom}
          style={styles.scrollDownBtn}
          hitSlop={8}
        >
          <Ionicons name="chevron-down" size={18} color="#1F2937" />
        </Pressable>
      )}
      {files.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {files.map((file, idx) => (
            <View key={`${file.uri}-${idx}`} style={styles.fileChip}>
              <Ionicons name="document" size={14} color={tintColor} />
              <Text style={styles.fileChipText} numberOfLines={1}>
                {file.name}
              </Text>
              <Pressable
                onPress={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                hitSlop={8}
              >
                <Ionicons name="close" size={14} color="#6B7280" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      <LiquidGlassSurface
        blurTint={isDark ? 'dark' : 'light'}
        blurIntensity={0}
        overlayColor={surfaceColor}
        borderColor={borderColor}
        webBackdropFilter="none"
        style={styles.glassShell}
      >
        <View style={styles.inputRow}>
          <AttachmentsPicker
            value={files}
            onChange={setFiles}
            addLabel=""
            maxFiles={10}
            horizontal
            showChips={false}
            style={styles.attachWrap}
          />
          {isRecording ? (
            <View style={[styles.recordingBox, { backgroundColor: inputBg, borderColor: inputBorder }]}>
              <MotiView
                style={styles.wave}
                from={{ scaleY: 0.4 }}
                animate={{ scaleY: 1 }}
                transition={{ type: 'timing', duration: 500, loop: true }}
              />
              <Text style={[styles.recordingTime, { color: textPrimary }]}>{formatTime(recordingTime)}</Text>
            </View>
          ) : recordedUri ? (
            <View style={[styles.voicePreview, { backgroundColor: inputBg, borderColor: inputBorder }]}>
              <View style={styles.voiceLeft}>
                <Ionicons name="mic" size={20} color={tintColor} />
                <Text style={[styles.recordingTime, { color: textPrimary }]}>{formatTime(recordingTime)}</Text>
              </View>
              <Pressable onPress={cancelVoice} hitSlop={8} style={styles.cancelVoice}>
                <Ionicons name="close" size={18} color="#6B7280" />
                <Text style={styles.cancelVoiceText}>Удалить</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.textWrapper, { backgroundColor: inputBg, borderColor: inputBorder }]}>
              <TextInput
                style={[
                  styles.input,
                  { color: textPrimary, height: inputHeight },
                  Platform.OS === 'web' && styles.inputWeb,
                  Platform.OS === 'web' && ({ outlineStyle: 'none', boxShadow: 'none' } as any),
                ]}
                multiline
                scrollEnabled={inputScrollable || inputHeight >= maxInputHeight}
                placeholder="Сообщение"
                placeholderTextColor="#9CA3AF"
                value={text}
                onChangeText={handleTextChange}
                onFocus={() => {
                  setShowEmoji(false);
                  onInputFocus?.();
                }}
                onContentSizeChange={handleContentSizeChange}
              />
              <Pressable
                onPress={() => setShowEmoji((v) => !v)}
                style={styles.emojiBtn}
                hitSlop={8}
              >
                <Ionicons name="happy-outline" size={18} color="#6B7280" />
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
                <Ionicons name={actionIcon} size={18} color={actionColor} />
                </MotiView>
              </AnimatePresence>
            </Animated.View>
          </Pressable>
        </View>
      </LiquidGlassSurface>

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

function withOpacity(color: string, opacity: number) {
  if (!color.startsWith('#')) return color;
  const hex = color.replace('#', '');
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const int = Number.parseInt(normalized, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

const ACTION_SIZE = 34;

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 6,
    paddingTop: 4,
    width: '100%',
    position: 'relative',
  },
  scrollDownBtn: {
    position: 'absolute',
    right: 10,
    top: -32,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  glassShell: {
    borderRadius: 22,
    paddingHorizontal: 6,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '100%' },
  attachWrap: { marginRight: 0, flexShrink: 0, alignSelf: 'center' },
  actionBtn: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  textWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: ACTION_SIZE,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 20,
    padding: 0,
    lineHeight: 20,
    color: '#111827',
    fontSize: 15,
    textAlignVertical: 'center',
  },
  inputWeb: {
    outlineWidth: 0,
    outlineColor: 'transparent',
    borderWidth: 0,
  },
  emojiBtn: { marginLeft: 2 },
  recordingBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: ACTION_SIZE,
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minHeight: ACTION_SIZE,
    position: 'relative',
    gap: 8,
  },
  voiceLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  cancelVoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  cancelVoiceText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
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
  chipsRow: { flexDirection: 'row', gap: 8, paddingVertical: 6 },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    maxWidth: 220,
  },
  fileChipText: { color: '#111827', fontSize: 12, flexShrink: 1 },
});
