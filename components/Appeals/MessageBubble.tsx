import { Text, Image, StyleSheet, View, Pressable, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { AppealMessage } from '@/types/appealsTypes';
import { MotiView } from 'moti';

export default function MessageBubble({
  message,
  own,
  onRetry,
}: {
  message: AppealMessage;
  own: boolean;
  onRetry?: () => void;
}) {
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

  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      style={[styles.bubble, own ? styles.own : styles.other]}
    >
      {message.text ? <Text style={styles.text}>{message.text}</Text> : null}
      {attachments.map((a, idx) => {
        if (a.fileType === 'IMAGE' && a.fileUrl) {
          return <Image key={`${a.fileUrl}-${idx}`} source={{ uri: a.fileUrl }} style={styles.image} />;
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
        <View style={styles.timeRow}>
          <Text style={styles.time}>{timeStr}</Text>
          {message.status === 'sending' ? (
            <ActivityIndicator size="small" color="#666" style={styles.statusIcon} />
          ) : null}
          {message.status === 'failed' ? (
            <View style={styles.failedRow}>
              <Ionicons name="warning" size={14} color="#DC2626" />
              {onRetry ? (
                <Pressable onPress={onRetry}>
                  <Text style={styles.retry}>Повторить</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
        <Text style={styles.date}>{dateStr}</Text>
      </View>
    </MotiView>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    padding: 10,
    marginHorizontal: 8,
    marginVertical: 4,
    borderRadius: 10,
  },
  own: { alignSelf: 'flex-end', backgroundColor: '#DCF7C5' },
  other: { backgroundColor: '#F1F1F1' },
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
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  time: { fontSize: 12, color: '#666' },
  date: { fontSize: 12, color: '#666' },
  statusIcon: { marginLeft: 4 },
  failedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  retry: { color: '#DC2626', marginLeft: 4, fontSize: 12 },
});
