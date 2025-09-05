import { Text, Image, StyleSheet, View, Pressable } from 'react-native';
import { useState, useEffect } from 'react';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { AppealMessage } from '@/types/appealsTypes';
import { MotiView, AnimatePresence } from 'moti';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedGestureHandler,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { PanGestureHandler } from 'react-native-gesture-handler';

export default function MessageBubble({ message, own }: { message: AppealMessage; own: boolean }) {
  const attachments = Array.isArray(message.attachments)
    ? message.attachments.filter(
        (a): a is NonNullable<typeof a> =>
          !!a && (a.fileType !== 'IMAGE' || !!a.fileUrl)
      )
    : [];

  const dt = new Date(message.createdAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  const dateStr = `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${String(dt.getFullYear()).slice(-2)}`;

  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentUri, setCurrentUri] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [showReactions, setShowReactions] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const reactionEmojis = ['👍', '❤️', '😂', '😮'];

  useEffect(() => {
    return () => {
      sound?.unloadAsync();
    };
  }, [sound]);

  function formatTime(ms: number) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60).toString().padStart(2, '0');
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  async function playAudio(uri: string) {
    try {
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
        if (currentUri === uri) {
          setCurrentUri(null);
          setPlaying(false);
          return;
        }
      }
      const { sound: s, status } = await Audio.Sound.createAsync({ uri });
      setSound(s);
      setCurrentUri(uri);
      setPlaying(true);
      setDuration(status.durationMillis || 0);
      setPosition(0);
      setProgress(0);
      await s.playAsync();
      s.setOnPlaybackStatusUpdate((st) => {
        if (!st.isLoaded) return;
        if (st.didJustFinish) {
          setPlaying(false);
          setCurrentUri(null);
          setProgress(0);
          setPosition(0);
          s.unloadAsync();
          setSound(null);
          return;
        }
        setPosition(st.positionMillis || 0);
        if (st.durationMillis) {
          setProgress((st.positionMillis || 0) / st.durationMillis);
          setDuration(st.durationMillis);
        }
      });
    } catch (e) {
      console.error(e);
    }
  }

  function handleLongPress() {
    setShowReactions(true);
  }
  function chooseReaction(e: string) {
    setReaction(e);
    setShowReactions(false);
  }

  const translateX = useSharedValue(0);
  function onReply() {
    console.log('reply to', message.id);
  }
  const gesture = useAnimatedGestureHandler({
    onActive: (e: any) => {
      translateX.value = Math.max(0, e.translationX);
    },
    onEnd: (e: any) => {
      if (e.translationX > 80) runOnJS(onReply)();
      translateX.value = withTiming(0);
    },
  });
  const rStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  return (
    <PanGestureHandler
      onGestureEvent={gesture}
      activeOffsetX={[-30, 30]}
      failOffsetY={[-10, 10]}
    >
      <Animated.View style={[styles.row, own && styles.rowOwn, rStyle]}>
        <Pressable onLongPress={handleLongPress} style={{ flexShrink: 1 }}>
          <MotiView
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0, translateY: -10 }}
            style={[styles.bubble, own ? styles.own : styles.other]}
          >
            {message.text ? <Text style={styles.text}>{message.text}</Text> : null}
            {attachments.map((a, idx) => {
              if (a.fileType === 'IMAGE' && a.fileUrl) {
                return (
                  <Image key={`${a.fileUrl}-${idx}`} source={{ uri: a.fileUrl }} style={styles.image} />
                );
              }
              if (a.fileType === 'AUDIO' && a.fileUrl) {
                const isCurrent = currentUri === a.fileUrl;
                return (
                  <View key={`${a.fileUrl}-${idx}`} style={styles.audio}>
                    <Pressable
                      onPress={() => playAudio(a.fileUrl)}
                      style={styles.play}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={playing && isCurrent ? 'pause' : 'play'}
                        size={16}
                        color="#fff"
                      />
                    </Pressable>
                    <View style={styles.bar}>
                      <View
                        style={[styles.barFill, { width: `${isCurrent ? progress * 100 : 0}%` }]}
                      />
                    </View>
                    <Text style={styles.audioTime}>
                      {formatTime(isCurrent ? position : duration)}
                    </Text>
                  </View>
                );
              }
              if (a.fileName) {
                return (
                  <Text key={`${a.fileUrl || a.fileName}-${idx}`} style={styles.file}>
                    {a.fileName}
                  </Text>
                );
              }
              return null;
            })}
            <View style={styles.meta}>
              <Text style={styles.time}>{timeStr}</Text>
              {own ? <Ionicons name="checkmark-done" size={16} color="#6B7280" /> : null}
            </View>
            <View style={[styles.tail, own ? styles.tailOwn : styles.tailOther]} />
            {reaction && (
              <View style={styles.reaction}>
                <Text>{reaction}</Text>
              </View>
            )}
          </MotiView>
        </Pressable>
        <AnimatePresence>
          {showReactions && (
            <MotiView
              from={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              style={[styles.reactionPicker, own ? { right: 40 } : { left: 40 }]}
            >
              {reactionEmojis.map((e) => (
                <Pressable key={e} onPress={() => chooseReaction(e)} style={{ marginHorizontal: 4 }}>
                  <Text style={{ fontSize: 20 }}>{e}</Text>
                </Pressable>
              ))}
            </MotiView>
          )}
        </AnimatePresence>
      </Animated.View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 4,
    paddingHorizontal: 8,
  },
  rowOwn: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '90%',
    minWidth: 80,
    padding: 8,
    borderRadius: 18,
    position: 'relative',
  },
  own: {
    alignSelf: 'flex-end',
    backgroundColor: '#7A3EF0',
    borderBottomRightRadius: 4,
  },
  other: {
    backgroundColor: '#2F2F37',
    borderBottomLeftRadius: 4,
  },
  text: { color: '#fff' },
  image: { width: 200, height: 120, marginTop: 6, borderRadius: 8 },
  file: { marginTop: 6, textDecorationLine: 'underline', color: '#9CA3AF' },
  audio: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  play: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  bar: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginRight: 8,
    borderRadius: 1,
    overflow: 'hidden',
  },
  barFill: {
    height: 2,
    backgroundColor: '#fff',
  },
  audioTime: { color: '#fff', fontSize: 12 },
  meta: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  time: { fontSize: 12, color: '#C4C4C4' },
  tail: {
    position: 'absolute',
    bottom: 0,
    width: 0,
    height: 0,
  },
  tailOwn: {
    right: -6,
    borderLeftWidth: 6,
    borderLeftColor: 'transparent',
    borderTopWidth: 6,
    borderTopColor: '#7A3EF0',
  },
  tailOther: {
    left: -6,
    borderRightWidth: 6,
    borderRightColor: 'transparent',
    borderTopWidth: 6,
    borderTopColor: '#2F2F37',
  },
  reactionPicker: {
    position: 'absolute',
    bottom: 40,
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    padding: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  reaction: {
    position: 'absolute',
    right: -16,
    bottom: -8,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 4,
  },
});
