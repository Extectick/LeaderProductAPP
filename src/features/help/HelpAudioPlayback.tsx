import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import type { HelpAttachment, HelpMediaSource, HelpMediaResolveOptions, HelpTransferProgress } from './helpApi';

export type HelpAudioSpeed = 1 | 1.5 | 2;
export type HelpAudioItem = { attachment: HelpAttachment; messageId: number; author: string; createdAt: string; ticketId?: number };
/** Borrow a source from its resolver. The resolver/cache owns URL lifetime,
 * including late or canceled results; playback never revokes shared blob URLs. */
export type HelpAudioResolver = (attachment: HelpAttachment, options?: HelpMediaResolveOptions) => Promise<HelpMediaSource>;
export type HelpAudioPlaybackState = {
  current: HelpAudioItem | null;
  positionSeconds: number;
  durationSeconds: number;
  progress: number;
  playing: boolean;
  loading: boolean;
  ready: boolean;
  error: string | null;
  speed: HelpAudioSpeed;
  transferProgress?: HelpTransferProgress;
};
export type HelpAudioPlaybackController = HelpAudioPlaybackState & {
  play: (item: HelpAudioItem, resolve: HelpAudioResolver) => Promise<void>;
  toggle: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  setSpeed: (speed: HelpAudioSpeed) => void;
  stop: () => void;
};
export type HelpAudioCommands = Pick<HelpAudioPlaybackController, 'play' | 'toggle' | 'seek' | 'setSpeed' | 'stop'>;
type Options = { userId: number | null | undefined; ticketId: number | null | undefined; onError?: (message: string) => void };
type Session = { generation: number; item: HelpAudioItem; resolve: HelpAudioResolver; controller: AbortController; prepared: boolean; observedPlayback: boolean; wantsPlay: boolean; failed: boolean };
const empty = (speed: HelpAudioSpeed = 1): HelpAudioPlaybackState => ({ current: null, positionSeconds: 0, durationSeconds: 0, progress: 0, playing: false, loading: false, ready: false, error: null, speed });
const seconds = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
const Context = createContext<HelpAudioPlaybackController | null>(null);
const CommandsContext = createContext<HelpAudioCommands | null>(null);

/** Own this hook once above the virtualized message list, never inside a row. */
export function useHelpAudioController({ userId, ticketId, onError }: Options): HelpAudioPlaybackController {
  const player = useAudioPlayer(null, { updateInterval: 100 });
  const nativeStatus = useAudioPlayerStatus(player);
  const scope = `${userId ?? ''}:${ticketId ?? ''}`;
  const identity = useRef(scope); identity.current = scope;
  const onErrorRef = useRef(onError); onErrorRef.current = onError;
  const [stored, setStored] = useState<{ scope: string; value: HelpAudioPlaybackState }>(() => ({ scope, value: empty() }));
  const snapshot = useRef(stored.value);
  const mounted = useRef(false), generation = useRef(0), rate = useRef<HelpAudioSpeed>(1);
  const session = useRef<Session | null>(null);
  const seekVersion = useRef(0), seekQueue = useRef<Promise<void>>(Promise.resolve());
  const seeking = useRef(false);

  const publish = useCallback((value: HelpAudioPlaybackState) => {
    snapshot.current = value;
    if (mounted.current) setStored({ scope: identity.current, value });
  }, []);
  const releaseSource = useCallback(() => {
    session.current?.controller.abort();
    try { player.pause(); } catch { /* useAudioPlayer owns final native disposal. */ }
    try { player.replace(null); } catch { /* Scope cleanup must still invalidate pending work. */ }
    // useHelpService may return this exact URL again on replay or to another
    // consumer. Its account-scoped cache performs the eventual URL revocation.
  }, [player]);
  const stop = useCallback(() => {
    generation.current++; seekVersion.current++; seeking.current = false;
    releaseSource(); session.current = null; publish(empty(rate.current));
  }, [publish, releaseSource]);
  useLayoutEffect(() => {
    mounted.current = true; rate.current = 1; publish(empty());
    return () => {
      mounted.current = false; generation.current++; seekVersion.current++; seeking.current = false;
      releaseSource(); session.current = null; snapshot.current = empty();
    };
  }, [scope, player, publish, releaseSource]);
  const valid = useCallback((operation: number, owner: string) => mounted.current && identity.current === owner && session.current?.generation === operation, []);
  const fail = useCallback((message: string, operation: number, owner: string) => {
    if (!valid(operation, owner)) return;
    if (session.current) { session.current.failed = true; session.current.wantsPlay = false; }
    try { player.pause(); } catch { /* Keep the actionable UI error. */ }
    publish({ ...snapshot.current, playing: false, loading: false, ready: false, error: message });
    onErrorRef.current?.(message);
  }, [player, publish, valid]);

  // Only a fresh native status event can update the current track. A new source
  // resets our snapshot immediately; the previous event is not reused on render.
  useEffect(() => {
    const active = session.current;
    if (!active?.prepared || active.failed || !mounted.current) return;
    if (nativeStatus.error) { fail('Не удалось воспроизвести аудио', active.generation, identity.current); return; }
    const duration = seconds(nativeStatus.duration), position = seeking.current ? snapshot.current.positionSeconds : Math.min(seconds(nativeStatus.currentTime), duration || Infinity);
    // A late finish from the replaced source must not close a newly loading
    // track. Only a session observed playing may finish, never a paused/seek UI.
    if (nativeStatus.didJustFinish && !nativeStatus.playing && active.observedPlayback && active.wantsPlay && !seeking.current) {
      stop(); return;
    }
    if (nativeStatus.isLoaded && nativeStatus.playing && !nativeStatus.didJustFinish) active.observedPlayback = true;
    publish({ ...snapshot.current, positionSeconds: position, durationSeconds: duration, progress: duration ? position / duration : 0,
      ready: nativeStatus.isLoaded, loading: !nativeStatus.isLoaded || nativeStatus.isBuffering,
      playing: nativeStatus.isLoaded && nativeStatus.playing, speed: rate.current });
  }, [nativeStatus, fail, publish, stop]);

  const seek = useCallback(async (value: number) => {
    const active = session.current;
    if (!active?.prepared || !snapshot.current.ready || !Number.isFinite(value)) return;
    const owner = identity.current, operation = active.generation, version = ++seekVersion.current;
    seeking.current = true;
    const duration = snapshot.current.durationSeconds, target = Math.max(0, Math.min(duration, value));
    publish({ ...snapshot.current, positionSeconds: target, progress: duration ? target / duration : 0 });
    // Coalesce queued drag samples. An older in-flight seek completes before the
    // most recent sample; its result can never overwrite the latest UI position.
    const work = seekQueue.current.catch(() => {}).then(async () => {
      if (!valid(operation, owner) || version !== seekVersion.current) return;
      try { await player.seekTo(target); }
      catch { if (version === seekVersion.current) fail('Не удалось перемотать аудио', operation, owner); }
      finally { if (version === seekVersion.current) seeking.current = false; }
    });
    seekQueue.current = work; await work;
  }, [fail, player, publish, valid]);

  const resume = useCallback(async (active: Session) => {
    const owner = identity.current, operation = active.generation;
    try {
      if (snapshot.current.durationSeconds > 0 && snapshot.current.positionSeconds >= snapshot.current.durationSeconds - .025) {
        await seekQueue.current.catch(() => {});
        if (!valid(operation, owner) || !active.wantsPlay) return;
        await player.seekTo(0);
        if (!valid(operation, owner) || !active.wantsPlay) return;
        publish({ ...snapshot.current, positionSeconds: 0, progress: 0 });
      }
      if (!valid(operation, owner) || !active.wantsPlay) return;
      player.setPlaybackRate(rate.current, 'medium'); player.play();
      publish({ ...snapshot.current, playing: true, error: null });
    } catch { fail('Не удалось воспроизвести аудио', operation, owner); }
  }, [fail, player, publish, valid]);

  const play = useCallback(async (item: HelpAudioItem, resolve: HelpAudioResolver) => {
    if (!mounted.current || identity.current !== scope || userId == null || ticketId == null || item.attachment.kind !== 'AUDIO' || (item.ticketId !== undefined && item.ticketId !== ticketId)) return;
    const previous = session.current;
    if (previous?.item.attachment.id === item.attachment.id && previous.item.messageId === item.messageId && !previous.failed) {
      previous.wantsPlay = true;
      if (previous.prepared) await resume(previous);
      return;
    }
    const owner = identity.current, operation = ++generation.current;
    seekVersion.current++; seeking.current = false; releaseSource();
    const active: Session = { generation: operation, item, resolve, controller: new AbortController(), prepared: false, observedPlayback: false, wantsPlay: true, failed: false };
    session.current = active;
    publish({ ...empty(rate.current), current: item, loading: true });
    try {
      const resolved = await resolve(item.attachment, { signal: active.controller.signal, onProgress: value => {
        if (valid(operation, owner)) publish({ ...snapshot.current, transferProgress: value });
      } });
      if (!valid(operation, owner)) return;
      await seekQueue.current.catch(() => {});
      if (!valid(operation, owner)) return;
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      if (!valid(operation, owner)) return;
      player.replace(resolved); active.prepared = true;
      publish({ ...snapshot.current, transferProgress: undefined });
      player.shouldCorrectPitch = true; player.setPlaybackRate(rate.current, 'medium');
      if (active.wantsPlay) player.play();
    } catch {
      fail('Не удалось загрузить голосовое сообщение', operation, owner);
    }
  }, [fail, player, publish, releaseSource, resume, scope, ticketId, userId, valid]);

  const toggle = useCallback(async () => {
    const active = session.current;
    if (!active) return;
    if (active.failed) { await play(active.item, active.resolve); return; }
    active.wantsPlay = active.prepared && snapshot.current.ready ? !snapshot.current.playing : !active.wantsPlay;
    if (!active.prepared) return;
    if (active.wantsPlay) { await resume(active); return; }
    try { player.pause(); publish({ ...snapshot.current, playing: false }); }
    catch { fail('Не удалось приостановить аудио', active.generation, identity.current); }
  }, [fail, play, player, publish, resume]);
  const setSpeed = useCallback((speed: HelpAudioSpeed) => {
    if (speed !== 1 && speed !== 1.5 && speed !== 2) return;
    rate.current = speed;
    try { if (session.current?.prepared) { player.shouldCorrectPitch = true; player.setPlaybackRate(speed, 'medium'); } }
    catch { if (session.current) fail('Не удалось изменить скорость аудио', session.current.generation, identity.current); return; }
    publish({ ...snapshot.current, speed });
  }, [fail, player, publish]);

  const visible = stored.scope === scope ? stored.value : empty();
  return useMemo(() => ({ ...visible, play, toggle, seek, setSpeed, stop }), [visible, play, toggle, seek, setSpeed, stop]);
}

export function HelpAudioPlaybackProvider({ value, children }: { value: HelpAudioPlaybackController; children: React.ReactNode }) {
  const { play, toggle, seek, setSpeed, stop } = value;
  const commands = useMemo(() => ({ play, toggle, seek, setSpeed, stop }), [play, toggle, seek, setSpeed, stop]);
  return <CommandsContext.Provider value={commands}><Context.Provider value={value}>{children}</Context.Provider></CommandsContext.Provider>;
}
export function useHelpAudioPlayback(): HelpAudioPlaybackController | null { return useContext(Context); }
export function useHelpAudioCommands(): HelpAudioCommands | null { return useContext(CommandsContext); }
