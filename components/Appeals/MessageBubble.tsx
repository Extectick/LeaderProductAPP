import {
  Text,
  Image,
  StyleSheet,
  View,
  Pressable,
  Modal,
  TouchableWithoutFeedback,
  Linking,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { AppealMessage } from '@/types/appealsTypes';
import { MotiView } from 'moti';
import * as FileSystem from 'expo-file-system/legacy';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { PresenceInfo } from '@/utils/presenceService';

type IoniconName = keyof typeof Ionicons.glyphMap;

export default function MessageBubble({
  message,
  own,
  presence,
  showHeader = true,
  isGrouped = false,
}: {
  message: AppealMessage;
  own: boolean;
  presence?: PresenceInfo;
  showHeader?: boolean;
  isGrouped?: boolean;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
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
  const senderFullName = [message.sender?.firstName, message.sender?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const senderName =
    senderFullName ||
    message.sender?.email ||
    (message.sender?.id ? `Пользователь #${message.sender.id}` : 'Пользователь');
  const presenceLabel = presence
    ? presence.isOnline
      ? 'онлайн'
      : presence.lastSeenAt
      ? `был(а) ${formatDistanceToNow(new Date(presence.lastSeenAt), { addSuffix: true, locale: ru })}`
      : 'не в сети'
    : null;
  const isSystem = message.type === 'SYSTEM';
  const senderDept = message.sender?.department?.name || null;
  const isAdmin = !!message.sender?.isAdmin;
  const isManager = !!message.sender?.isDepartmentManager;
  const avatarUrl = message.sender?.avatarUrl || null;
  const initials = buildUserInitials({
    firstName: message.sender?.firstName,
    lastName: message.sender?.lastName,
    email: message.sender?.email,
    fallbackName: senderName,
  });

  const [currentUri, setCurrentUri] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const showHeaderRow = showHeader && !isSystem;
  const metaText = `${timeStr} · ${dateStr}`;
  const hasAttachments = attachments.length > 0;
  const bubbleMaxWidth =
    Platform.OS === 'web'
      ? Math.min(screenWidth * 0.7, 620)
      : Math.min(screenWidth * 0.85, 420);
  const bubbleMinWidth = hasAttachments
    ? Platform.OS === 'web'
      ? 220
      : 200
    : 0;
  const imageWidth = Math.min(bubbleMaxWidth - 16, Platform.OS === 'web' ? 420 : 260);
  const imageHeight = Math.max(120, Math.round(imageWidth * 0.6));

  useEffect(() => {
    if (!currentUri) return;
    if (!status.didJustFinish) return;
    setCurrentUri(null);
    player.pause();
    void player.seekTo(0);
  }, [currentUri, player, status.didJustFinish]);

  function playAudio(uri: string) {
    try {
      if (currentUri === uri) {
        if (status.playing) {
          player.pause();
          void player.seekTo(0);
          setCurrentUri(null);
        } else {
          player.play();
          setCurrentUri(uri);
        }
        return;
      }
      player.pause();
      player.replace({ uri });
      player.play();
      setCurrentUri(uri);
    } catch (e) {
      console.error(e);
    }
  }

  async function downloadAttachment(uri: string, fileName = 'attachment') {
    try {
      setDownloading(true);
      setDownloadProgress(0);
      const ext = extractExtension(fileName) || extractExtension(uri) || 'bin';
      const baseDir =
        (FileSystem as any).documentDirectory ||
        (FileSystem as any).cacheDirectory ||
        '';
      const safeName = sanitizeFileName(fileName);
      const baseName = safeName.replace(/\.[^/.]+$/, '');
      const dest = `${baseDir}${baseName}.${String(ext).toLowerCase()}`;
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

  if (isSystem) {
    return (
      <MotiView
        from={{ opacity: 0, translateY: 6 }}
        animate={{ opacity: 1, translateY: 0 }}
        style={styles.systemBubble}
      >
        <Text style={styles.systemText}>{message.text || 'Системное уведомление'}</Text>
        <Text style={styles.systemMeta}>{metaText}</Text>
      </MotiView>
    );
  }

  return (
    <>
      <MotiView
        from={{ opacity: 0, translateY: 10 }}
        animate={{ opacity: 1, translateY: 0 }}
        style={[
          styles.bubble,
          own ? styles.own : styles.other,
          { maxWidth: bubbleMaxWidth, minWidth: bubbleMinWidth },
          isGrouped && styles.grouped,
          !showHeaderRow && styles.compactTop,
        ]}
      >
        {showHeaderRow ? (
          <View style={[styles.senderRow, own && styles.senderRowOwn]}>
            <View style={styles.avatarWrap}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
              )}
            </View>
            <View style={styles.senderMeta}>
              <View style={styles.senderNameRow}>
                <Text style={styles.senderName}>
                  {own ? 'Вы' : senderName}
                </Text>
                {isManager ? <Ionicons name="ribbon" size={12} color="#2563EB" style={styles.roleIcon} /> : null}
                {isAdmin ? <Ionicons name="shield-checkmark" size={12} color="#0F172A" style={styles.roleIcon} /> : null}
              </View>
              {senderDept ? (
                <Text style={styles.senderDept}>
                  {senderDept}
                </Text>
              ) : null}
              {!own && presenceLabel ? (
                <View style={styles.presenceWrap}>
                  <View
                    style={[
                      styles.presenceDot,
                      { backgroundColor: presence?.isOnline ? '#22c55e' : '#94a3b8' },
                    ]}
                  />
                  <Text style={styles.presenceText}>
                    {presenceLabel}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
        {message.text ? <Text style={styles.text}>{message.text}</Text> : null}
        {attachments.map((a, idx) => {
          if (a.fileType === 'IMAGE' && a.fileUrl) {
            return (
              <Pressable
                key={`${a.fileUrl}-${idx}`}
                onPress={() => setPreviewUri(a.fileUrl ?? null)}
              >
                <Image
                  source={{ uri: a.fileUrl }}
                  style={[styles.image, { width: imageWidth, height: imageHeight }]}
                />
              </Pressable>
            );
          }
          if (a.fileType === 'AUDIO' && a.fileUrl) {
            const isCurrent = currentUri === a.fileUrl;
            const isPlaying = isCurrent && status.playing;
            const showProgress = isCurrent && status.duration > 0;
            const progressPct = showProgress
              ? Math.min(100, (status.currentTime / status.duration) * 100)
              : 0;
            const rawName = a.fileName || extractFileName(a.fileUrl) || 'Voice message';
            const displayName = formatFileDisplayName(normalizeFileName(rawName));
            const ext = extractExtension(displayName) || 'AUDIO';
            return (
              <Pressable
                key={`${a.fileUrl}-${idx}`}
                style={styles.audio}
                onPress={() => a.fileUrl && playAudio(a.fileUrl)}
              >
                <View style={styles.audioIcon}>
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color="#2563EB" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.audioText} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <View style={styles.fileMetaRow}>
                    <Text style={styles.fileMetaLabel}>Аудио</Text>
                    <View style={styles.fileBadge}>
                      <Text style={styles.fileBadgeText}>{ext}</Text>
                    </View>
                  </View>
                  {showProgress ? (
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          }
          if (a.fileName || a.fileUrl) {
            const uri = a.fileUrl;
            const rawName = a.fileName || extractFileName(uri) || 'file';
            const displayName = formatFileDisplayName(normalizeFileName(rawName));
            const ext = extractExtension(displayName) || extractExtension(uri) || 'FILE';
            const { icon, label } = resolveFileType(ext);
            return (
              <Pressable
                key={`${uri || a.fileName || idx}`}
                style={styles.file}
                onPress={() =>
                  uri
                    ? downloadAttachment(uri, displayName)
                    : undefined
                }
              >
                <View style={styles.fileIcon}>
                  <Ionicons name={icon} size={18} color="#2563EB" />
                </View>
                <View style={styles.fileContent}>
                  <Text style={styles.fileText} numberOfLines={2} ellipsizeMode="tail">
                    {downloading ? `Скачивание... ${downloadProgress}%` : displayName}
                  </Text>
                  <View style={styles.fileMetaRow}>
                    <Text style={styles.fileMetaLabel}>{label}</Text>
                    <View style={styles.fileBadge}>
                      <Text style={styles.fileBadgeText}>{ext}</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          }
          return null;
        })}
        <View style={styles.meta}>
          <Text style={styles.metaText} numberOfLines={2} ellipsizeMode="clip">
            {metaText}
          </Text>
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
                  <Image
                    source={{ uri: previewUri }}
                    style={[styles.previewImage, { width: screenWidth, height: screenHeight }]}
                    resizeMode="contain"
                  />
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

const legacyEscape = (globalThis as any).escape as ((input: string) => string) | undefined;

function normalizeFileName(name?: string | null) {
  if (!name) return 'Файл';
  let next = name;
  if (next.includes('%')) {
    try {
      const decoded = decodeURIComponent(next);
      if (decoded) next = decoded;
    } catch {}
  }
  if (/_([0-9A-Fa-f]{2})/.test(next)) {
    try {
      const replaced = next.replace(/_([0-9A-Fa-f]{2})/g, '%$1');
      const decoded = decodeURIComponent(replaced);
      if (decoded && /[\u0400-\u04FF]/.test(decoded)) {
        next = decoded;
      }
    } catch {}
  }
  const hasCyrillic = /[\u0400-\u04FF]/.test(next);
  const hasReplacement = next.includes('�');
  const looksMojibake =
    /[ÃÂÐÑ]/.test(next) ||
    (!hasCyrillic && /[\u00C0-\u00FF]/.test(next)) ||
    hasReplacement;
  if (looksMojibake) {
    const decoded = decodeLatin1ToUtf8(next);
    if (decoded && decoded !== next && /[\u0400-\u04FF]/.test(decoded)) {
      next = decoded;
    }
  }
  return next;
}

function decodeLatin1ToUtf8(input: string) {
  try {
    if (typeof TextDecoder !== 'undefined') {
      const bytes = new Uint8Array(Array.from(input, (c) => c.charCodeAt(0)));
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }
  } catch {}
  if (legacyEscape) {
    try {
      return decodeURIComponent(legacyEscape(input));
    } catch {}
  }
  return utf8DecodeFromLatin1(input);
}

function utf8DecodeFromLatin1(input: string) {
  const bytes = Array.from(input, (c) => c.charCodeAt(0) & 0xff);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const b1 = bytes[i];
    if (b1 < 0x80) {
      out += String.fromCharCode(b1);
      continue;
    }
    if (b1 >= 0xc0 && b1 < 0xe0 && i + 1 < bytes.length) {
      const b2 = bytes[++i];
      out += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
      continue;
    }
    if (b1 >= 0xe0 && b1 < 0xf0 && i + 2 < bytes.length) {
      const b2 = bytes[++i];
      const b3 = bytes[++i];
      const code = ((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
      out += String.fromCharCode(code);
      continue;
    }
    if (b1 >= 0xf0 && b1 < 0xf8 && i + 3 < bytes.length) {
      const b2 = bytes[++i];
      const b3 = bytes[++i];
      const b4 = bytes[++i];
      let codepoint =
        ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);
      codepoint -= 0x10000;
      out += String.fromCharCode(0xd800 + ((codepoint >> 10) & 0x3ff));
      out += String.fromCharCode(0xdc00 + (codepoint & 0x3ff));
      continue;
    }
    out += '\uFFFD';
  }
  return out;
}

function formatFileDisplayName(name: string) {
  const clean = name.trim();
  if (!clean) return 'Файл';
  const parts = clean.split('.');
  if (parts.length < 2) {
    return clean.length > 40 ? `${clean.slice(0, 37)}…` : clean;
  }
  const ext = parts.pop();
  const base = parts.join('.');
  const maxBase = 44;
  if (base.length > maxBase) {
    return `${base.slice(0, maxBase).trimEnd()}….${ext}`;
  }
  return `${base}.${ext}`;
}

function extractExtension(value?: string | null) {
  if (!value) return null;
  const clean = value.split('?')[0].split('#')[0];
  const last = clean.split('/').pop() || clean;
  if (!last.includes('.')) return null;
  const ext = last.split('.').pop();
  return ext ? ext.toUpperCase() : null;
}

function extractFileName(value?: string | null) {
  if (!value) return null;
  const clean = value.split('?')[0].split('#')[0];
  const last = clean.split('/').pop();
  return last || null;
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 180);
}

function resolveFileType(ext: string): { icon: IoniconName; label: string } {
  const upper = ext.toUpperCase();
  if (['PDF'].includes(upper)) return { icon: 'document-text', label: 'PDF документ' };
  if (['DOC', 'DOCX', 'RTF'].includes(upper)) return { icon: 'document', label: 'Документ' };
  if (['XLS', 'XLSX', 'CSV'].includes(upper)) return { icon: 'grid', label: 'Таблица' };
  if (['PPT', 'PPTX'].includes(upper)) return { icon: 'easel', label: 'Презентация' };
  if (['ZIP', 'RAR', '7Z'].includes(upper)) return { icon: 'archive', label: 'Архив' };
  if (['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF', 'HEIC', 'HEIF'].includes(upper)) {
    return { icon: 'image-outline', label: 'Изображение' };
  }
  if (['MP3', 'M4A', 'WAV', 'AAC', 'OGG'].includes(upper)) {
    return { icon: 'mic', label: 'Аудио' };
  }
  return { icon: 'document-attach', label: 'Файл' };
}

function buildUserInitials(params: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  fallbackName?: string | null;
}) {
  const first = (params.firstName || '').trim();
  const last = (params.lastName || '').trim();
  if (first || last) {
    return `${first[0] || ''}${last[0] || first[1] || ''}`.toUpperCase();
  }

  const email = (params.email || '').trim();
  if (email) {
    const local = email.split('@')[0].replace(/[^a-zA-Zа-яА-Я0-9]/g, '');
    if (local.length >= 2) return local.slice(0, 2).toUpperCase();
    if (local.length === 1) return `${local[0]}${local[0]}`.toUpperCase();
  }

  const fallback = (params.fallbackName || '').trim().replace(/[^a-zA-Zа-яА-Я0-9]/g, '');
  if (fallback.length >= 2) return fallback.slice(0, 2).toUpperCase();
  return 'US';
}

const styles = StyleSheet.create({
  bubble: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 4,
    borderRadius: 18,
    minWidth: 140,
  },
  own: {
    alignSelf: 'flex-end',
    backgroundColor: '#DCF8C6',
    borderTopRightRadius: 6,
    marginLeft: 48,
    marginRight: 8,
  },
  other: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderTopLeftRadius: 6,
    marginLeft: 8,
    marginRight: 48,
  },
  grouped: { marginTop: 2 },
  compactTop: { paddingTop: 6 },
  systemBubble: {
    alignSelf: 'center',
    maxWidth: '90%',
    marginVertical: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  systemText: { color: '#111827', fontWeight: '600', textAlign: 'center' },
  systemMeta: { color: '#6B7280', fontSize: 11, textAlign: 'center', marginTop: 4 },
  text: { color: '#111827', fontSize: 15, lineHeight: 21 },
  image: { marginTop: 8, borderRadius: 10 },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignSelf: 'stretch',
    width: '100%',
  },
  fileIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  fileContent: { flex: 1, minWidth: 0 },
  fileText: { color: '#0F172A', fontWeight: '600', fontSize: 13, lineHeight: 18 },
  fileMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  fileMetaLabel: { color: '#64748B', fontSize: 11, flex: 1 },
  fileBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
  },
  fileBadgeText: { color: '#1E293B', fontSize: 10, fontWeight: '700' },
  audio: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignSelf: 'stretch',
    width: '100%',
  },
  audioIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  audioText: { color: '#0F172A', fontWeight: '600', fontSize: 13 },
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
    alignItems: 'center',
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
    width: '100%',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  senderRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  senderRowOwn: { justifyContent: 'flex-end' },
  senderMeta: { flex: 1, marginLeft: 8, minWidth: 0 },
  senderNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', rowGap: 2, minWidth: 0 },
  senderName: { fontSize: 12, fontWeight: '700', color: '#111827', flexShrink: 1, minWidth: 0 },
  senderDept: { fontSize: 11, color: '#6B7280', marginTop: 2, flexShrink: 1, minWidth: 0 },
  roleIcon: { marginLeft: 4 },
  avatarWrap: { width: 28, height: 28, borderRadius: 10, overflow: 'hidden' },
  avatar: { width: 28, height: 28, borderRadius: 10 },
  avatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 11, fontWeight: '700', color: '#1F2937' },
  presenceWrap: { flexDirection: 'row', alignItems: 'center', marginTop: 2, flexWrap: 'wrap', minWidth: 0 },
  presenceDot: { width: 6, height: 6, borderRadius: 3 },
  presenceText: { fontSize: 11, color: '#6b7280', marginLeft: 4, flexShrink: 1, minWidth: 0, flexWrap: 'wrap' },
  metaText: {
    fontSize: 11,
    color: '#8C96A2',
    textAlign: 'right',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    includeFontPadding: false,
  },
  readMark: { marginLeft: 6, flexShrink: 0, alignSelf: 'flex-end' },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  previewBox: {
    width: '100%',
    height: '100%',
    position: 'relative',
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: { backgroundColor: '#000' },
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
