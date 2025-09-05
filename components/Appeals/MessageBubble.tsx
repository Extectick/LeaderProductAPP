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
  const [showReactions, setShowReactions] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const reactionEmojis = ['👍', '❤️', '😂', '😮'];

  useEffect(() => {
    return () => {
      sound?.unloadAsync();
    };
  }, [sound]);

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
      const { sound: s } = await Audio.Sound.createAsync({ uri });
      setSound(s);
      setCurrentUri(uri);
      setPlaying(true);
      await s.playAsync();
      s.setOnPlaybackStatusUpdate((status) => {
        if (!('didJustFinish' in status)) return;
        if (status.didJustFinish) {
          setPlaying(false);
          setCurrentUri(null);
          s.unloadAsync();
          setSound(null);
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

  const initials = (message.sender?.firstName?.[0] || message.sender?.email?.[0] || '?').toUpperCase();

  return (
    <PanGestureHandler onGestureEvent={gesture}>
      <Animated.View style={[styles.row, own && styles.rowOwn, rStyle]}>
        {!own && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}
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
                return (
                  <Pressable
                    key={`${a.fileUrl}-${idx}`}
                    style={styles.audio}
                    onPress={() => playAudio(a.fileUrl)}
                  >
                    <Ionicons name={playing ? 'pause' : 'play'} size={16} color="#2563EB" />
                    <Text style={styles.audioText}>{a.fileName || 'Voice message'}</Text>
                  </Pressable>
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
        {own && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}
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
    marginVertical: 2,
    paddingHorizontal: 4,
  },
  rowOwn: { justifyContent: 'flex-end' },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  avatarText: { color: '#111827', fontWeight: '600' },
  bubble: {
    maxWidth: '90%',
    minWidth: 80,
    padding: 10,
    borderRadius: 16,
    position: 'relative',
  },
  own: { alignSelf: 'flex-end', backgroundColor: '#DCF7C5', borderBottomRightRadius: 2 },
  other: { backgroundColor: '#F1F1F1', borderBottomLeftRadius: 2 },
  text: { color: '#111827' },
  image: { width: 200, height: 120, marginTop: 6, borderRadius: 8 },
  file: { marginTop: 6, textDecorationLine: 'underline', color: '#2563EB' },
  audio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  audioText: { color: '#2563EB', textDecorationLine: 'underline' },
  meta: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  time: { fontSize: 12, color: '#666' },
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
    borderTopColor: '#DCF7C5',
  },
  tailOther: {
    left: -6,
    borderRightWidth: 6,
    borderRightColor: 'transparent',
    borderTopWidth: 6,
    borderTopColor: '#F1F1F1',
  },
  reactionPicker: {
    position: 'absolute',
    bottom: 40,
    flexDirection: 'row',
    backgroundColor: '#fff',
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
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 4,
  },
});
