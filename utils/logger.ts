
// utils/logger.ts (fixed: no 'append' option; batched flush)
// NOTE: using legacy API to silence deprecation warnings in SDK 54+
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

const LOG_FILE = `${FileSystem.cacheDirectory}app.log`;
const MAX_MEM_LOGS = 300;
const FLUSH_DEBOUNCE_MS = 1200;

type LogEntry = {
  ts: string;
  level: Level;
  tag?: string;
  message: string;
  meta?: any;
};

interface AccessLog {
  timestamp: number;
  isAuthenticated: boolean;
  hasProfile: boolean;
  profileStatus?: string;
  route?: string;
  error?: string;
}

let memBuffer: LogEntry[] = [];
let pendingText = '';
let flushTimer: any = null;
let flushing = false;

function now() {
  return new Date().toISOString();
}

function safeJson(v: any) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function format(entry: LogEntry) {
  const base = `[${entry.ts}] ${entry.level}${entry.tag ? ` [${entry.tag}]` : ''}: ${entry.message}`;
  const meta = entry.meta ? ` ${safeJson(entry.meta)}` : '';
  return `${base}${meta}\n`;
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushToDisk, FLUSH_DEBOUNCE_MS);
}

async function flushToDisk() {
  if (flushing || !pendingText) return;
  flushing = true;
  try {
    // ensure cache directory exists
    try {
      await FileSystem.makeDirectoryAsync(FileSystem.cacheDirectory!, { intermediates: true });
    } catch {}
    const info = await FileSystem.getInfoAsync(LOG_FILE);
    if (info.exists) {
      // append by read+write (FileSystem.writeAsStringAsync does not support 'append' in your SDK)
      const existing = await FileSystem.readAsStringAsync(LOG_FILE);
      await FileSystem.writeAsStringAsync(LOG_FILE, existing + pendingText, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } else {
      await FileSystem.writeAsStringAsync(LOG_FILE, pendingText, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[logger] flush error', e);
  } finally {
    pendingText = '';
    flushing = false;
  }
}

function push(entry: LogEntry) {
  memBuffer.push(entry);
  if (memBuffer.length > MAX_MEM_LOGS) memBuffer.shift();

  const line = format(entry);
  // Console output for adb logcat visibility
  switch (entry.level) {
    case 'DEBUG':
      // eslint-disable-next-line no-console
      console.debug(line);
      break;
    case 'INFO':
      console.log(line);
      break;
    case 'WARN':
      console.warn(line);
      break;
    case 'ERROR':
    case 'FATAL':
      console.error(line);
      break;
  }
  // batch persist
  pendingText += line;
  scheduleFlush();
}

export const logger = {
  debug(message: string, meta?: any, tag?: string) {
    push({ ts: now(), level: 'DEBUG', message, meta, tag });
  },
  info(message: string, meta?: any, tag?: string) {
    push({ ts: now(), level: 'INFO', message, meta, tag });
  },
  warn(message: string, meta?: any, tag?: string) {
    push({ ts: now(), level: 'WARN', message, meta, tag });
  },
  error(message: string, meta?: any, tag?: string) {
    push({ ts: now(), level: 'ERROR', message, meta, tag });
  },
  fatal(message: string, meta?: any, tag?: string) {
    push({ ts: now(), level: 'FATAL', message, meta, tag });
  },
  captureException(error: any, context?: any, tag?: string) {
    const meta = {
      context,
      name: error?.name,
      message: error?.message || String(error),
      stack: error?.stack,
    };
    push({ ts: now(), level: 'ERROR', message: '[Exception]', meta, tag });
  },
  getMemBuffer() {
    return [...memBuffer];
  },
  async getLogFileUri() {
    const info = await FileSystem.getInfoAsync(LOG_FILE);
    return info.exists ? LOG_FILE : null;
  },
  async clearFile() {
    try {
      await FileSystem.deleteAsync(LOG_FILE, { idempotent: true });
    } catch {}
  },
  async upload(url: string, extra?: Record<string, any>) {
    try {
      // ensure latest pending is flushed
      await flushToDisk();
      const info = await FileSystem.getInfoAsync(LOG_FILE);
      let content = '';
      if (info.exists) {
        content = await FileSystem.readAsStringAsync(LOG_FILE);
      } else {
        content = memBuffer.map(format).join('');
      }
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: content, extra }),
      });
    } catch (e) {
      console.warn('[logger] upload error', e);
    }
  },
};

export const logAccessAttempt = async (data: Omit<AccessLog, 'timestamp'>) => {
  const logEntry: AccessLog = {
    timestamp: Date.now(),
    ...data
  };

  // Логирование в консоль для разработки
  console.log('[Access Log]', logEntry);

  // Сохранение в AsyncStorage
  try {
    const existingLogs = await AsyncStorage.getItem('accessLogs');
    const logs = existingLogs ? JSON.parse(existingLogs) : [];
    logs.push(logEntry);
    await AsyncStorage.setItem('accessLogs', JSON.stringify(logs));
  } catch (error) {
    console.error('Failed to save access log:', error);
  }
};

export const getAccessLogs = async (): Promise<AccessLog[]> => {
  try {
    const logs = await AsyncStorage.getItem('accessLogs');
    return logs ? JSON.parse(logs) : [];
  } catch (error) {
    console.error('Failed to get access logs:', error);
    return [];
  }
};
