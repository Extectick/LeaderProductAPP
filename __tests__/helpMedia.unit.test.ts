import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Animated, Image, PanResponder, Platform, StyleSheet, Text } from 'react-native';

const mockPlayer = { replace: jest.fn(), play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() };
const mockUseAudioPlayer = jest.fn(() => mockPlayer);
let mockStatus = { playing: false, currentTime: 0, duration: 10, playbackRate: 1, didJustFinish: false };
let mockReduced = true;
jest.mock('expo-audio', () => ({ useAudioPlayer: (...args: any[]) => (mockUseAudioPlayer as any)(...args), useAudioPlayerStatus: () => mockStatus }));
jest.mock('expo-image', () => ({ Image: 'CachedImage' }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file://cache/', downloadAsync: jest.fn().mockResolvedValue({ status: 200, uri: 'file://image' }) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn().mockResolvedValue(true), shareAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 20, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('../src/features/help/helpTheme', () => ({ useHelpTheme: () => ({ muted: '#999999', accent: '#3388ff', accentText: '#68B0FF', elevated: '#333333' }), useHelpReducedMotion: () => mockReduced }));
jest.mock('../src/features/help/components/HelpPrimitives', () => ({ HelpIcon: 'HelpIcon' }));
import { HelpAudio, HelpGallery, HelpImage } from '../src/features/help/components/HelpMedia';
import { HelpMediaLoadingContext } from '../src/features/help/helpMediaLoading';
import { HelpAudioPlaybackProvider, type HelpAudioPlaybackController } from '../src/features/help/HelpAudioPlayback';

describe('Help media geometry and lifecycle', () => {
  let screen: TestRenderer.ReactTestRenderer | undefined;
  let props: any;
  let now = 0;
  let frames: Map<number, FrameRequestCallback>;
  let frameId = 0;
  const file = { id: 'photo-1', kind: 'IMAGE', name: 'Снимок.jpg', size: 128, mimeType: 'image/jpeg' } as any;
  const voice = { id: 'voice-1', kind: 'AUDIO', name: 'voice.m4a', size: 4096, mimeType: 'audio/mp4' } as any;
  let playback: HelpAudioPlaybackController;
  beforeEach(() => {
    frames = new Map(); now = 0; mockReduced = true;
    mockStatus = { playing: false, currentTime: 0, duration: 10, playbackRate: 1, didJustFinish: false };
    mockPlayer.replace.mockReset(); mockPlayer.play.mockReset(); mockPlayer.pause.mockReset(); mockPlayer.seekTo.mockReset().mockResolvedValue(undefined);
    mockUseAudioPlayer.mockClear();
    playback = { current: null, positionSeconds: 0, durationSeconds: 0, progress: 0, playing: false, loading: false, ready: false, error: null, speed: 1,
      play: jest.fn().mockResolvedValue(undefined), toggle: jest.fn().mockResolvedValue(undefined), seek: jest.fn().mockResolvedValue(undefined), setSpeed: jest.fn(), stop: jest.fn() };
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation(cb => { frames.set(++frameId, cb); return frameId; });
    jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
    jest.spyOn(PanResponder, 'create').mockImplementation(config => ({ panHandlers: config } as any));
    props = { attachment: file, resolve: jest.fn().mockResolvedValue({ uri: 'file://image.jpg' }), onError: jest.fn() };
  });
  afterEach(async () => { if (screen) await act(async () => screen!.unmount()); screen = undefined; jest.restoreAllMocks(); });
  const byId = (id: string) => screen!.root.findAll(n => n.props.testID === id)[0];
  const byLabel = (label: string) => screen!.root.findAll(n => n.props.label === label || n.props.accessibilityLabel === label)[0];
  async function renderAudio() { props.attachment = voice; await act(async () => { screen = TestRenderer.create(React.createElement(HelpAudio, props)); }); }
  async function startAudio() { await act(async () => byLabel('Воспроизвести голосовое сообщение').props.onPress()); }
  const sharedAudioTree = () => React.createElement(HelpAudioPlaybackProvider, { value: playback, children: React.createElement(HelpAudio, props) });
  async function renderSharedAudio() { props = { ...props, attachment: voice, messageId: 41, author: 'Анна', createdAt: '2026-10-28T10:15:00Z', ticketId: 7 }; await act(async () => { screen = TestRenderer.create(sharedAudioTree()); }); }
  async function updateSharedAudio() { await act(async () => screen!.update(sharedAudioTree())); }
  function activateSharedAudio(override: Partial<HelpAudioPlaybackController> = {}) { playback = { ...playback, current: { attachment: props.attachment, messageId: props.messageId, author: props.author, createdAt: props.createdAt, ticketId: props.ticketId }, ready: true, durationSeconds: 10, ...override }; }
  const imageTree = (proximity:'visible'|'near'|'deferred'='visible') => React.createElement(HelpMediaLoadingContext.Provider, {value:proximity}, React.createElement(HelpImage,props));
  async function renderImage(proximity:'visible'|'near'|'deferred'='visible') { await act(async()=>{screen=TestRenderer.create(imageTree(proximity));}); }
  async function updateImage(proximity:'visible'|'near'|'deferred'='visible') { await act(async()=>screen!.update(imageTree(proximity))); }
  const originalImage = () => screen!.root.findByType('CachedImage' as any);
  async function renderGallery() { props = { attachments: [file, { ...file, id: 'photo-2', name: 'Второй.jpg' }], initialIndex: 0, resolve: props.resolve, onClose: jest.fn(), onError: props.onError }; await act(async () => { screen = TestRenderer.create(React.createElement(HelpGallery, props)); }); }
  async function tick(time: number) { now = time; const callbacks = [...frames.values()]; frames.clear(); await act(async () => callbacks.forEach(cb => cb(time))); }
  test('compact audio shares one caption row with timestamp and adds no vertical padding', async () => {
    props.captionRight = React.createElement(Text, { testID: 'stamp' }, '12:34'); await renderAudio();
    expect(byId('help-audio').props.style).toMatchObject({ paddingVertical: 0, gap: 10, minWidth: 218 });
    expect(byLabel('Воспроизвести голосовое сообщение').props.style).toMatchObject({ width: 36, height: 36 });
    expect(byId('help-audio-seek').props.style.height).toBe(28);
    expect(byId('help-audio-caption').props.style.minHeight).toBe(12);
    expect(byId('help-audio-caption').findAll(n => n.props.testID === 'stamp').length).toBeGreaterThan(0);
  });
  test('real playback position advances fractionally between native samples and stops on pause', async () => {
    mockStatus.playing = true; mockStatus.currentTime = 2; await renderAudio(); await startAudio();
    await tick(50); expect(parseFloat(byId('help-audio-progress').props.style.width)).toBeCloseTo(20.5);
    await tick(75); expect(parseFloat(byId('help-audio-progress').props.style.width)).toBeCloseTo(20.75);
    mockStatus = { ...mockStatus, playing: false, currentTime: 2.1 };
    await act(async () => screen!.update(React.createElement(HelpAudio, props)));
    await tick(1000); expect(parseFloat(byId('help-audio-progress').props.style.width)).toBeCloseTo(21);
    expect(frames.size).toBe(0);
  });
  test('fixed decorative bars are hidden from accessibility and clipped by real progress', async () => {
    mockStatus.currentTime = 2.5; await renderAudio(); await startAudio();
    const decoration = byId('help-audio-decorative-track');
    expect(decoration.props['aria-hidden']).toBe(true);
    expect(decoration.props.accessibilityElementsHidden).toBe(true);
    expect(decoration.props.importantForAccessibility).toBe('no-hide-descendants');
    const bars = decoration.findAll(n => typeof n.type === 'string' && n.props.style?.width === 3);
    expect(bars).toHaveLength(28);
    expect(bars[0].props.style.height).toBeCloseTo(9 * .65);
    const progress = byId('help-audio-progress');
    expect(progress.props.style).toMatchObject({ width: '25%', overflow: 'hidden', height: 28 });
    expect(progress.props.accessibilityElementsHidden).toBe(true);
    expect(byId('help-audio-seek').props.accessibilityRole).toBe('adjustable');
  });
  test('seeking clamps to duration and adjustable actions move five seconds', async () => {
    await renderAudio(); await startAudio();
    await act(async () => byId('help-audio-seek').props.onLayout({ nativeEvent: { layout: { width: 100 } } }));
    await act(async () => byId('help-audio-seek').props.onResponderGrant({ nativeEvent: { locationX: 200 } }));
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(10);
    await act(async () => byId('help-audio-seek').props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }));
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(5);
  });
  test('late audio resolution never replaces player or reports error after unmount', async () => {
    let reject!: (error: Error) => void;
    props.resolve.mockReturnValue(new Promise((_, no) => { reject = no; }));
    await renderAudio(); await startAudio(); await act(async () => screen!.unmount()); screen = undefined;
    await act(async () => reject(new Error('gone')));
    expect(props.onError).not.toHaveBeenCalled(); expect(mockPlayer.replace).not.toHaveBeenCalled();
  });
  test('standalone preview resolves only on Play and ignores a previous recycled download', async () => {
    let finish!: (source: any) => void;
    props.resolve.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await renderAudio();
    expect(props.resolve).not.toHaveBeenCalled();
    expect(byLabel('Воспроизвести голосовое сообщение').props.disabled).not.toBe(true);
    await startAudio(); expect(byId('help-audio-loading')).toBeDefined();
    props.attachment = { ...voice, id: 'voice-2' };
    await act(async () => screen!.update(React.createElement(HelpAudio, props)));
    await act(async () => finish({ uri: 'file://old-voice' }));
    expect(mockPlayer.replace).not.toHaveBeenCalled();
    await startAudio();
    expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: 'file://image.jpg' });
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  });
  test('shared voice rows allocate no native player or downloads and Play delegates metadata', async () => {
    await renderSharedAudio();
    expect(mockUseAudioPlayer).not.toHaveBeenCalled(); expect(props.resolve).not.toHaveBeenCalled();
    expect(byLabel('Воспроизвести голосовое сообщение').props.disabled).not.toBe(true);
    expect(byId('help-audio-seek').props.onStartShouldSetResponder()).toBe(false);
    expect(byId('help-audio-seek').props.accessibilityValue).toEqual({ min: 0, max: 0, now: 0 });
    expect(byId('help-audio-caption').findByType(Text).props.children.join('')).toBe('0:00 / 4 КБ');
    await startAudio();
    expect(playback.play).toHaveBeenCalledWith({ attachment: voice, messageId: 41, author: 'Анна', createdAt: '2026-10-28T10:15:00Z', ticketId: 7 }, props.resolve);
    expect(props.resolve).not.toHaveBeenCalled();
  });
  test('shared active voice smoothly displays progress, pauses and delegates clamped seeking', async () => {
    await renderSharedAudio(); activateSharedAudio({ positionSeconds: 2, progress: .2, playing: true, speed: 1.5 }); await updateSharedAudio();
    await tick(100); expect(parseFloat(byId('help-audio-progress').props.style.width)).toBeCloseTo(21.5);
    await act(async () => byLabel('Пауза').props.onPress()); expect(playback.toggle).toHaveBeenCalledTimes(1);
    await act(async () => byId('help-audio-seek').props.onLayout({ nativeEvent: { layout: { width: 100 } } }));
    await act(async () => byId('help-audio-seek').props.onResponderGrant({ nativeEvent: { locationX: 200 } }));
    expect(playback.seek).toHaveBeenLastCalledWith(10);
    await act(async () => byId('help-audio-seek').props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }));
    expect(playback.seek).toHaveBeenLastCalledWith(5);
    expect(mockPlayer.seekTo).not.toHaveBeenCalled(); expect(mockUseAudioPlayer).not.toHaveBeenCalled();
  });
  test('shared Stop immediately resets rows and old callbacks cannot seek or toggle another message', async () => {
    await renderSharedAudio(); activateSharedAudio({ positionSeconds: 7, progress: .7, playing: true }); await updateSharedAudio();
    const oldSeek = byId('help-audio-seek').props.onAccessibilityAction, oldPause = byLabel('Пауза').props.onPress;
    playback.stop(); playback = { ...playback, current: null, ready: false, playing: false, positionSeconds: 0, durationSeconds: 0, progress: 0 };
    await updateSharedAudio();
    expect(byId('help-audio-progress').props.style.width).toBe('0%');
    expect(byId('help-audio-seek').props.accessibilityValue.max).toBe(0);
    await act(async () => { oldPause(); oldSeek({ nativeEvent: { actionName: 'increment' } }); });
    expect(playback.toggle).not.toHaveBeenCalled(); expect(playback.seek).not.toHaveBeenCalled();
    await act(async () => screen!.unmount()); screen = undefined;
    expect(playback.stop).toHaveBeenCalledTimes(1); // Rows never stop the persistent player on virtualization.
  });
  test('shared loading appears only on the matching attachment and message', async () => {
    await renderSharedAudio(); activateSharedAudio({ loading: true, ready: false }); await updateSharedAudio();
    expect(byId('help-audio-loading')).toBeDefined();
    expect(byId('help-audio-seek').props.onStartShouldSetResponder()).toBe(false);
    await act(async () => byLabel('Загрузка голосового сообщения').props.onPress()); expect(playback.toggle).toHaveBeenCalledTimes(1);
    props.messageId = 42; await updateSharedAudio();
    expect(byId('help-audio-loading')).toBeUndefined();
    await startAudio(); expect(playback.play).toHaveBeenLastCalledWith(expect.objectContaining({ messageId: 42, attachment: voice }), props.resolve);
    expect(mockUseAudioPlayer).not.toHaveBeenCalled(); expect(props.resolve).not.toHaveBeenCalled();
  });
  test('recycling shared rows discards stale callbacks and supplies current author, ticket and resolver', async () => {
    await renderSharedAudio(); const oldPlay = byLabel('Воспроизвести голосовое сообщение').props.onPress;
    props = { ...props, attachment: { ...voice, id: 'voice-2' }, messageId: 99, ticketId: 8, author: 'Иван', createdAt: '2026-10-28T11:45:00Z', resolve: jest.fn() };
    await updateSharedAudio();
    await act(async () => oldPlay()); expect(playback.play).not.toHaveBeenCalled();
    await startAudio();
    expect(playback.play).toHaveBeenCalledWith({ attachment: props.attachment, messageId: 99, ticketId: 8, author: 'Иван', createdAt: props.createdAt }, props.resolve);
    expect(props.resolve).not.toHaveBeenCalled();
  });
  test('same row uses fresh metadata and resolver after account context updates', async () => {
    await renderSharedAudio(); const existingPlay = byLabel('Воспроизвести голосовое сообщение').props.onPress;
    props = { ...props, author: 'Анна IT', createdAt: '2026-10-28T12:00:00Z', resolve: jest.fn() };
    await updateSharedAudio();
    await act(async () => existingPlay());
    expect(playback.play).toHaveBeenCalledWith(expect.objectContaining({ messageId: 41, author: 'Анна IT', createdAt: props.createdAt }), props.resolve);
    expect(props.resolve).not.toHaveBeenCalled();
  });
  test('late shared seek rejection after recycling does not report an error against the new row', async () => {
    let reject!: (reason: Error) => void;
    (playback.seek as jest.Mock).mockReturnValue(new Promise((_, no) => { reject = no; }));
    await renderSharedAudio(); activateSharedAudio(); await updateSharedAudio();
    await act(async () => byId('help-audio-seek').props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    props.messageId = 42; await updateSharedAudio();
    await act(async () => reject(new Error('stale')));
    expect(props.onError).not.toHaveBeenCalled(); expect(byId('help-audio-progress').props.style.width).toBe('0%');
  });
  test('image reports actual positive aspect ratio and ignores malformed dimensions', async () => {
    props.onAspectRatio = jest.fn(); await act(async () => { screen = TestRenderer.create(React.createElement(HelpImage, props)); });
    const image = originalImage();
    act(() => image.props.onLoad({ source: { width: 400, height: 200 } }));
    act(() => image.props.onLoad({ nativeEvent: { source: { width: 200, height: 400 } } }));
    act(() => image.props.onLoad({ source: { width: 0, height: 0 } }));
    act(() => image.props.onLoad({ source: { width: Infinity, height: 200 } }));
    expect(props.onAspectRatio).toHaveBeenCalledTimes(2); expect(props.onAspectRatio).toHaveBeenNthCalledWith(1,2);expect(props.onAspectRatio).toHaveBeenLastCalledWith(.5);
  });
  test('web DOM image load uses intrinsic target dimensions without a native source', async () => {
    jest.replaceProperty(Platform,'OS','web');
    props.onAspectRatio = jest.fn(); await act(async () => { screen = TestRenderer.create(React.createElement(HelpImage, props)); });
    const image = screen!.root.findByType(Image);
    act(() => image.props.onLoad({ nativeEvent: { target: { naturalWidth: 900, naturalHeight: 600, width: 225, height: 225 } } }));
    expect(props.onAspectRatio).toHaveBeenLastCalledWith(1.5);
    act(() => image.props.onLoad({ currentTarget: { naturalWidth: 400, naturalHeight: 800 } }));
    expect(props.onAspectRatio).toHaveBeenLastCalledWith(0.5);
    expect(() => act(() => image.props.onLoad({ nativeEvent: {} }))).not.toThrow();
    expect(props.onAspectRatio).toHaveBeenCalledTimes(2);
  });
  test('Expo image events avoid the deprecated nativeEvent getter that logs per-photo warnings', async()=>{
    props.onAspectRatio=jest.fn();await renderImage();
    const deprecated=jest.fn();
    const event={source:{width:600,height:400}};
    Object.defineProperty(event,'nativeEvent',{get:()=>{deprecated();return event;}});
    await act(async()=>originalImage().props.onLoad(event));
    expect(props.onAspectRatio).toHaveBeenCalledWith(1.5);
    expect(deprecated).not.toHaveBeenCalled();
  });
  test('deferred cells keep their inline preview and fixed geometry without resolving the original', async()=>{
    const thumbnail='data:image/jpeg;base64,cHJldmlldw==';
    props.attachment={...file,thumbnailDataUri:thumbnail};props.style={width:120,height:160};
    await renderImage('deferred');
    expect(props.resolve).not.toHaveBeenCalled();
    expect(byId('help-image-preview').props.source).toEqual({uri:thumbnail});
    expect(screen!.root.findAllByType('CachedImage' as any)).toHaveLength(0);
    expect(StyleSheet.flatten(byId('help-progressive-image').props.style)).toMatchObject({width:120,height:160,overflow:'hidden'});
    await updateImage('near');
    expect(props.resolve).toHaveBeenCalledWith(props.attachment);
    expect(originalImage().props.priority).toBe('low');
  });
  test('preview stays visible while the original is resolving and loading, with account-scoped cache key intact', async()=>{
    let finish!:(source:any)=>void;
    props.resolve.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    props.attachment={...file,thumbnailDataUri:'data:image/jpeg;base64,cHJldmlldw=='};
    props.style={width:150,height:200};
    await renderImage();
    expect(byId('help-image-preview')).toBeDefined();expect(screen!.root.findAllByType('CachedImage' as any)).toHaveLength(0);
    const source={uri:'https://private.example/photo',headers:{Authorization:'Bearer test-only'},cacheKey:'help:7:photo-1:qa'};
    await act(async()=>finish(source));
    const image=originalImage();
    expect(image.props).toMatchObject({source,cachePolicy:'memory-disk',recyclingKey:source.cacheKey,priority:'high',transition:0,contentFit:'cover'});
    expect(image.props.placeholder).toEqual({uri:props.attachment.thumbnailDataUri});
    expect(byId('help-image-preview')).toBeDefined();
    await act(async()=>image.props.onLoad({source:{width:300,height:400}}));
    await updateImage('deferred');
    expect(originalImage().props.source).toEqual(source); // An already decoded cell does not flash back to a thumbnail.
    expect(StyleSheet.flatten(byId('help-progressive-image').props.style)).toMatchObject({width:150,height:200});
  });
  test('recycling hides the previous source immediately and ignores its late resolver result', async()=>{
    const pending=new Map<string,(source:any)=>void>();
    props.resolve.mockImplementation((attachment:any)=>new Promise(resolve=>pending.set(attachment.id,resolve)));
    await renderImage();
    props.attachment={...file,id:'photo-2',thumbnailDataUri:'data:image/jpeg;base64,bmV3'};
    await updateImage();
    await act(async()=>pending.get('photo-1')!({uri:'file://old.jpg',cacheKey:'old-account-key'}));
    expect(screen!.root.findAllByType('CachedImage' as any)).toHaveLength(0);
    expect(byId('help-image-preview').props.source.uri).toBe(props.attachment.thumbnailDataUri);
    await act(async()=>pending.get('photo-2')!({uri:'file://new.jpg',cacheKey:'new-account-key'}));
    expect(originalImage().props.source.uri).toBe('file://new.jpg');
    props.attachment={...file,id:'photo-3'};
    await updateImage('deferred');
    expect(screen!.root.findAllByType('CachedImage' as any)).toHaveLength(0);
    expect(props.resolve).toHaveBeenCalledTimes(2);
  });
  test('changing account resolver hides the same attachment source and rejects old-account completion', async()=>{
    let finishOld!:(source:any)=>void;
    props.resolve.mockReturnValue(new Promise(resolve=>{finishOld=resolve;}));
    await renderImage();
    props.resolve=jest.fn().mockResolvedValue({uri:'file://new-account.jpg',cacheKey:'help:other-account:photo-1'});
    await updateImage();
    await act(async()=>finishOld({uri:'file://old-account.jpg',cacheKey:'help:old-account:photo-1'}));
    expect(originalImage().props.source.uri).toBe('file://new-account.jpg');
    expect(originalImage().props.recyclingKey).toBe('help:other-account:photo-1');
  });
  test('late native callbacks from a recycled image cannot hide or resize the new image', async()=>{
    props.onAspectRatio=jest.fn();
    await renderImage();
    const oldCallbacks=originalImage().props;
    props.attachment={...file,id:'photo-2'};
    props.resolve.mockResolvedValue({uri:'file://new.jpg'});
    await updateImage();
    await act(async()=>oldCallbacks.onLoad({source:{width:900,height:100}}));
    expect(props.onAspectRatio).not.toHaveBeenCalled();
    await act(async()=>oldCallbacks.onError({error:'old request failed'}));
    expect(originalImage().props.source.uri).toBe('file://new.jpg');
    await act(async()=>originalImage().props.onLoad({source:{width:400,height:300}}));
    expect(props.onAspectRatio).toHaveBeenLastCalledWith(4/3);
  });
  test.each(['resolve','decode'])('a %s error retains the image container and preview', async(kind)=>{
    props.style={width:220,height:120};props.attachment={...file,thumbnailDataUri:'data:image/jpeg;base64,cHJldmlldw=='};
    if(kind==='resolve')props.resolve.mockRejectedValue(new Error('Unavailable'));
    await renderImage();
    if(kind==='decode')await act(async()=>originalImage().props.onError({error:'Decode failure'}));
    expect(StyleSheet.flatten(byId('help-progressive-image').props.style)).toMatchObject({width:220,height:120});
    expect(byId('help-image-preview')).toBeDefined();expect(byLabel('Изображение недоступно')).toBeDefined();
    expect(screen!.root.findAllByType('CachedImage' as any)).toHaveLength(0);
  });
  test('near cells use low native priority; entering the viewport raises it without losing cache identity', async()=>{
    props.resolve.mockResolvedValue({uri:'file://cached.jpg',cacheKey:'help:7:photo-1'});mockReduced=false;
    await renderImage('near');
    expect(originalImage().props).toMatchObject({priority:'low',recyclingKey:'help:7:photo-1',transition:120});
    await updateImage('visible');
    expect(originalImage().props).toMatchObject({priority:'high',recyclingKey:'help:7:photo-1',source:{cacheKey:'help:7:photo-1'}});
  });
  test('gallery places round header controls, filename footer and edge-centered navigation', async () => {
    await renderGallery();
    expect(byLabel('Закрыть изображение').props.style).toMatchObject({ width: 40, height: 40, borderRadius: 20 });
    expect(byLabel('Следующее изображение').props.style).toMatchObject({ top: '50%', right: 8, width: 34 });
    expect(byId('help-gallery-footer').findAll(n => n.type === Text && n.props.children === 'Снимок.jpg').length).toBe(1);
    await act(async () => byLabel('Следующее изображение').props.onPress());
    expect(byId('help-gallery-footer').findAll(n => n.type === Text && n.props.children === 'Второй.jpg').length).toBe(1);
  });
  test('gesture termination restores image and never dismisses; reduced motion close calls once', async () => {
    await renderGallery(); const stage = byId('help-gallery-stage');
    act(() => stage.props.onPanResponderMove(null, { dy: 180 }));
    act(() => stage.props.onPanResponderTerminate()); expect(props.onClose).not.toHaveBeenCalled();
    act(() => stage.props.onPanResponderRelease(null, { dy: 140, vy: 0 }));
    act(() => byLabel('Закрыть изображение').props.onPress());
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
  test('interrupted dismiss animation cannot close after gallery unmount', async () => {
    mockReduced = false;
    let completion: ((state: { finished: boolean }) => void) | undefined;
    const stop = jest.fn();
    jest.spyOn(Animated, 'timing').mockImplementation(() => ({ start: cb => { completion = cb; }, stop, reset: jest.fn() } as any));
    await renderGallery(); act(() => byLabel('Закрыть изображение').props.onPress());
    await act(async () => screen!.unmount()); screen = undefined;
    act(() => completion?.({ finished: true })); expect(stop).toHaveBeenCalled(); expect(props.onClose).not.toHaveBeenCalled();
  });
  test('multiple images open a compact current/all download menu', async () => {
    await renderGallery(); act(() => byLabel('Скачать').props.onPress());
    const items = screen!.root.findAll(n => n.props.accessibilityRole === 'menuitem');
    expect(items.length).toBeGreaterThanOrEqual(2);
    act(() => byLabel('Закрыть выбор скачивания').props.onPress());
    expect(screen!.root.findAll(n => n.props.accessibilityRole === 'menuitem')).toHaveLength(0);
  });
});
