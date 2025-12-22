import { Text, Image, StyleSheet, View, Pressable, Modal, TouchableWithoutFeedback, Linking, Platform } from 'react-native';
import { useState, useEffect } from 'react';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { AppealMessage } from '@/types/appealsTypes';
import { MotiView } from 'moti';
import * as FileSystem from 'expo-file-system';

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
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<{ pos: number; dur: number }>({ pos: 0, dur: 0 });
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

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
      const { sound: s } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;
          setAudioProgress({ pos: status.positionMillis || 0, dur: status.durationMillis || 0 });
          if (status.didJustFinish) {
            setPlaying(false);
            setCurrentUri(null);
            s.unloadAsync();
            setSound(null);
            setAudioProgress({ pos: 0, dur: status.durationMillis || 0 });
          }
        }
      );
      setSound(s);
      setCurrentUri(uri);
      setPlaying(true);
      await s.playAsync();
    } catch (e) {
      console.error(e);
    }
  }

  async function downloadAttachment(uri: string, fileName = 'attachment') {
    try {
      setDownloading(true);
      setDownloadProgress(0);
      const ext = uri.split('.').pop() || 'bin';
      const baseDir =
        (FileSystem as any).documentDirectory ||
        (FileSystem as any).cacheDirectory ||
        '';
      const dest = `${baseDir}${fileName}.${ext}`;
      const dl = FileSystem.createDownloadResumable(
        uri,
        dest,
        {},
        (progress) => {
          const pct = progress.totalBytesExpectedToWrite
            ? progress.totalBytesWritten / progress.totalBytesExpectedToWrite
            : 0;
            setDownloadProgress(Math.round(pct * 100));
          }
        );
        await dl.downloadAsync();
        setDownloadProgress(100);
        await Linking.openURL(dest).catch(() => {});
    } catch (e) {
      console.warn('download failed', e);
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }
  }

  return (
    <>
      <MotiView
        from={{ opacity: 0, translateY: 10 }}
        animate={{ opacity: 1, translateY: 0 }}
        style={[styles.bubble, own ? styles.own : styles.other]}
      >
        {message.text ? <Text style={styles.text}>{message.text}</Text> : null}
        {attachments.map((a, idx) => {
          if (a.fileType === 'IMAGE' && a.fileUrl) {
            return (
              <Pressable
                key={`${a.fileUrl}-${idx}`}
                onPress={() => setPreviewUri(a.fileUrl ?? null)}
              >
                <Image source={{ uri: a.fileUrl }} style={styles.image} />
              </Pressable>
            );
          }
          if (a.fileType === 'AUDIO' && a.fileUrl) {
            return (
              <Pressable
                key={`${a.fileUrl}-${idx}`}
                style={styles.audio}
                onPress={() => a.fileUrl && playAudio(a.fileUrl)}
              >
                <Ionicons name={playing && currentUri === a.fileUrl ? 'pause' : 'play'} size={16} color="#2563EB" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.audioText}>{a.fileName || 'Voice message'}</Text>
          {currentUri === a.fileUrl && audioProgress.dur > 0 ? (
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, (audioProgress.pos / audioProgress.dur) * 100)}%` },
                        ]}
                      />
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          }
          if (a.fileName) {
            const uri = a.fileUrl;
            return (
              <Pressable
                key={`${uri || a.fileName}-${idx}`}
                style={styles.file}
                onPress={() =>
                  uri
                    ? downloadAttachment(uri, a.fileName || 'attachment')
                    : undefined
                }
              >
                <Ionicons name="document" size={16} color="#2563EB" />
                <Text style={styles.fileText}>
                  {downloading ? `Скачивание... ${downloadProgress}%` : a.fileName}
                </Text>
              </Pressable>
            );
          }
          return null;
        })}
        <View style={styles.meta}>
          <Text style={styles.time}>{timeStr}</Text>
          <Text style={styles.date}>{dateStr}</Text>
          {own ? (
            <View style={styles.readMark}>
              <Ionicons
                name={(message.readBy?.length ?? 0) > 0 ? 'checkmark-done' : 'checkmark'}
                size={14}
                color={(message.readBy?.length ?? 0) > 0 ? '#2563EB' : '#9CA3AF'}
              />
            </View>
          ) : null}
        </View>
      </MotiView>

      <Modal visible={!!previewUri} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <TouchableWithoutFeedback onPress={() => setPreviewUri(null)}>
          <View style={styles.previewBackdrop}>
            {previewUri ? (
              <TouchableWithoutFeedback>
                <View style={styles.previewBox}>
                  <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
                  <Pressable style={styles.previewClose} onPress={() => setPreviewUri(null)}>
                    <Ionicons name="close" size={22} color="#fff" />
                  </Pressable>
                  <Pressable
                    style={styles.previewDownload}
                    onPress={() => Linking.openURL(previewUri).catch(() => {})}
                  >
                    <Ionicons name={Platform.OS === 'ios' ? 'download-outline' : 'download'} size={18} color="#fff" />
                    <Text style={{ color: '#fff', marginLeft: 6 }}>Открыть</Text>
                  </Pressable>
                </View>
              </TouchableWithoutFeedback>
            ) : null}
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
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
  file: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fileText: { color: '#2563EB', textDecorationLine: 'underline' },
  audio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  audioText: { color: '#2563EB', textDecorationLine: 'underline' },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2563EB',
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    alignItems: 'center',
  },
  time: { fontSize: 12, color: '#666' },
  date: { fontSize: 12, color: '#666' },
  readMark: { marginLeft: 6 },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  previewBox: {
    width: '100%',
    maxHeight: '90%',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000',
  },
  previewImage: { width: '100%', height: 400, backgroundColor: '#000' },
  previewClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 8,
  },
  previewDownload: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
});
