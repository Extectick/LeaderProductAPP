import AsyncStorage from '@react-native-async-storage/async-storage';
import { addAppealMessage, FileLike } from '@/utils/appealsService';
import { AppealMessage, UserMini } from '@/types/appealsTypes';

/**
 * Хранилище сообщений обращений.
 * Поддерживает временные идентификаторы, расширенные статусы
 * и очередь повторной отправки.
 */
class AppealChatStore {
  private messages: Record<number, AppealMessage[]> = {};
  private listeners: Record<number, Set<(m: AppealMessage[]) => void>> = {};
  private queue: {
    appealId: number;
    tempId: string;
    payload: { text?: string; files?: FileLike[] };
  }[] = [];
  private hydrated = false;
  private readonly STORAGE_KEY = 'appealChatStore';

  /** Инициализация из AsyncStorage */
  async init() {
    if (this.hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.messages = parsed.messages || {};
        this.queue = parsed.queue || [];
      }
    } catch {
      // ignore
    }
    this.hydrated = true;
  }

  private persist() {
    AsyncStorage.setItem(
      this.STORAGE_KEY,
      JSON.stringify({ messages: this.messages, queue: this.queue }),
    ).catch(() => {});
  }

  private emit(appealId: number) {
    const list = this.listeners[appealId];
    if (list) {
      const msgs = this.messages[appealId] || [];
      list.forEach((l) => l(msgs));
    }
    this.persist();
  }

  /** Подписка на изменения сообщений по обращению */
  subscribe(appealId: number, listener: (m: AppealMessage[]) => void) {
    if (!this.listeners[appealId]) this.listeners[appealId] = new Set();
    this.listeners[appealId]!.add(listener);
    listener(this.messages[appealId] || []);
    return () => {
      this.listeners[appealId]!.delete(listener);
    };
  }

  /** Установка полного списка сообщений (например, после загрузки с сервера) */
  setMessages(appealId: number, msgs: AppealMessage[]) {
    this.messages[appealId] = msgs;
    this.emit(appealId);
  }

  /** Обновление/добавление сообщения */
  upsertMessage(appealId: number, msg: AppealMessage) {
    const arr = this.messages[appealId] || [];
    const idx = arr.findIndex(
      (m) => m.id === msg.id || (msg.tempId && m.tempId === msg.tempId),
    );
    if (idx >= 0) {
      arr[idx] = { ...arr[idx], ...msg };
    } else {
      arr.push(msg);
    }
    this.messages[appealId] = arr;
    this.emit(appealId);
  }

  /** Частичное обновление сообщения */
  updateMessage(
    appealId: number,
    id: number | string,
    patch: Partial<AppealMessage>,
  ) {
    const arr = this.messages[appealId] || [];
    const idx = arr.findIndex(
      (m) => m.id === id || m.tempId === id,
    );
    if (idx >= 0) {
      arr[idx] = { ...arr[idx], ...patch };
      this.messages[appealId] = arr;
      this.emit(appealId);
    }
  }

  /** Добавление локального сообщения и попытка отправки */
  async sendMessage(
    appealId: number,
    payload: { text?: string; files?: FileLike[] },
    sender?: UserMini,
  ) {
    await this.init();
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const local: AppealMessage = {
      id: -Date.now(),
      tempId,
      text: payload.text,
      createdAt: new Date().toISOString(),
      sender: sender || { id: 0, email: '' },
      attachments: [],
      status: 'sending',
    } as AppealMessage;

    this.upsertMessage(appealId, local);
    this.queue.push({ appealId, tempId, payload });
    this.persist();

    try {
      const res = await addAppealMessage(appealId, payload);
      this.updateMessage(appealId, tempId, {
        id: res.id,
        createdAt: res.createdAt,
        status: 'sent',
      });
      this.queue = this.queue.filter((q) => q.tempId !== tempId);
      this.persist();
    } catch (e) {
      this.updateMessage(appealId, tempId, { status: 'failed' });
    }
  }

  /** Синхронизация сообщения, пришедшего по WebSocket */
  syncIncomingMessage(appealId: number, msg: AppealMessage) {
    this.queue = this.queue.filter((q) => q.tempId !== msg.tempId);
    this.upsertMessage(appealId, { ...msg, status: msg.status || 'sent' });
  }

  /** Повторная отправка сообщений из очереди */
  async retryQueue() {
    await this.init();
    const pending = [...this.queue];
    for (const item of pending) {
      await this.sendMessage(item.appealId, item.payload);
    }
  }
}

export default new AppealChatStore();

