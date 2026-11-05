import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ActivityIndicator, Animated, Image, PanResponder, Platform, StyleSheet, Text } from 'react-native';

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
jest.mock('../src/features/help/helpTheme', () => ({ useHelpTheme: jest.fn(() => ({ muted: '#999999', accent: '#3388ff', accentText: '#68B0FF', elevated: '#333333' })), useHelpReducedMotion: () => mockReduced }));
jest.mock('../src/features/help/components/HelpPrimitives', () => ({ HelpIcon: 'HelpIcon' }));
import { HelpAudio, HelpGallery, HelpImage } from '../src/features/help/components/HelpMedia';
import { createHelpImageCache, HelpImageCacheContext, HelpMediaLoadingContext } from '../src/features/help/helpMediaLoading';
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
  let imageCache: ReturnType<typeof createHelpImageCache>;
  beforeEach(() => {
    frames = new Map(); now = 0; mockReduced = true;
    imageCache=createHelpImageCache();
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
  type Proximity='visible'|'near'|'deferred'|'retained';
  const imageTree = (proximity:Proximity='visible',key?:string) => React.createElement(HelpImageCacheContext.Provider,{value:imageCache},React.createElement(HelpMediaLoadingContext.Provider, {value:proximity}, React.createElement(HelpImage,{...props,key})));
  async function renderImage(proximity:Proximity='visible') { await act(async()=>{screen=TestRenderer.create(imageTree(proximity));}); }
  async function updateImage(proximity:Proximity='visible') { await act(async()=>screen!.update(imageTree(proximity))); }
  const originalImage = () => screen!.root.findByType('CachedImage' as any);
  async function renderGallery(extra:Record<string,unknown>={}) { props = { attachments: [file, { ...file, id: 'photo-2', name: 'Второй.jpg' }], initialIndex: 0, resolve: props.resolve, onClose: jest.fn(), onError: props.onError,...extra }; await act(async () => { screen = TestRenderer.create(React.createElement(HelpGallery, props)); });await act(async()=>byId('help-gallery-stage').props.onLayout({nativeEvent:{layout:{width:300,height:600,y:70}}})); }
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
  test('inactive voice presentation skips other-track position samples and keeps fresh actions', async () => {
    await renderSharedAudio();
    const theme = require('../src/features/help/helpTheme').useHelpTheme as jest.Mock;
    const before = theme.mock.calls.length;
    const oldPlay = byLabel('Воспроизвести голосовое сообщение').props.onPress;
    for (let position = 1; position <= 10; position++) {
      playback = { ...playback, current: { attachment: voice, messageId: 99, author: '', createdAt: '', ticketId: 7 }, playing: true, positionSeconds: position, play: jest.fn().mockResolvedValue(undefined) };
      await updateSharedAudio();
    }
    expect(theme.mock.calls.length).toBe(before);
    expect(byId('help-audio-progress').props.style.width).toBe('0%');
    await act(async () => oldPlay());
    expect(playback.play).toHaveBeenCalledWith(expect.objectContaining({ messageId: 41 }), props.resolve);
  });
  test('active voice progress advances without rebuilding decorative bars', async () => {
    await renderSharedAudio(); activateSharedAudio({ positionSeconds: 2, playing: true }); await updateSharedAudio();
    const bars = () => byId('help-audio-decorative-track').findAll(node => node.props.style?.opacity === .3);
    const before = bars().map(node => node.props.style);
    expect(before.length).toBeGreaterThan(0);
    await tick(50);
    expect(parseFloat(byId('help-audio-progress').props.style.width)).toBeCloseTo(20.5);
    bars().forEach((node, index) => expect(node.props.style).toBe(before[index]));
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
  test('fullscreen contain reserves grey space until pixels decode, then restores transparent letterboxing without crossfade',async()=>{
    props.resizeMode='contain';mockReduced=false;await renderImage();
    expect(StyleSheet.flatten(byId('help-progressive-image').props.style).backgroundColor).toBe('#E4E7EB');
    expect(byId('help-image-placeholder').props.accessibilityLabel).toBe('Загрузка изображения');
    await act(async()=>originalImage().props.onLoad({source:{width:400,height:300}}));
    expect(StyleSheet.flatten(byId('help-progressive-image').props.style).backgroundColor).toBe('transparent');
    expect(screen!.root.findAllByProps({testID:'help-image-placeholder'})).toHaveLength(0);
    expect(originalImage().props).toMatchObject({contentFit:'contain',transition:0});
  });
  test('recycling and a restored native source reserve grey space until that cell decodes, without another request or spinner',async()=>{
    props.style={width:120,height:160};await renderImage();
    await act(async()=>originalImage().props.onLoad({source:{width:400,height:300}}));
    await act(async()=>screen!.update(imageTree('retained','snapshot')));
    expect(byId('help-image-placeholder')).toBeDefined();
    expect(StyleSheet.flatten(byId('help-progressive-image').props.style)).toMatchObject({width:120,height:160,backgroundColor:'#E4E7EB'});
    expect(screen!.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    expect(props.resolve).toHaveBeenCalledTimes(1);
    await act(async()=>originalImage().props.onLoad({source:{width:400,height:300}}));
    expect(screen!.root.findAllByProps({testID:'help-image-placeholder'})).toHaveLength(0);
    props.attachment={...file,id:'another',url:'/different'};await updateImage('deferred');
    expect(byId('help-image-placeholder')).toBeDefined();
    expect(props.resolve).toHaveBeenCalledTimes(1);
  });
  test('A to B to A recycling requires fresh decode and rejects callbacks from the first A mount',async()=>{
    const first=props.attachment;await renderImage();
    const staleLoad=originalImage().props.onLoad;
    await act(async()=>staleLoad({source:{width:400,height:300}}));
    props.attachment={...file,id:'pending-other',url:'/pending-other'};await updateImage('deferred');
    props.attachment=first;await updateImage('retained');
    expect(byId('help-image-placeholder')).toBeDefined();
    await act(async()=>staleLoad({source:{width:400,height:300}}));
    expect(byId('help-image-placeholder')).toBeDefined();
    await act(async()=>originalImage().props.onLoad({source:{width:400,height:300}}));
    expect(screen!.root.findAllByProps({testID:'help-image-placeholder'})).toHaveLength(0);
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
  test('a transition copy and remounted cell reuse a loaded photo without resolving, fading or showing a loader again',async()=>{
    mockReduced=false;await renderImage();
    const source=originalImage().props.source;
    await act(async()=>originalImage().props.onLoad({source:{width:400,height:300}}));
    await act(async()=>screen!.update(imageTree('retained','snapshot')));
    expect(props.resolve).toHaveBeenCalledTimes(1);
    expect(originalImage().props).toMatchObject({source,transition:0});
    expect(screen!.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    await act(async()=>screen!.update(imageTree('deferred','recycled-cell')));
    expect(originalImage().props.source).toBe(source);
    expect(props.resolve).toHaveBeenCalledTimes(1);
  });
  test('decode callbacks stay stable across loaded state and layout metadata updates',async()=>{
    props.onAspectRatio=jest.fn();await renderImage();
    const loaded=originalImage().props.onLoad,failed=originalImage().props.onError;
    await act(async()=>loaded({source:{width:400,height:300}}));
    expect(originalImage().props.onLoad).toBe(loaded);
    expect(originalImage().props.onError).toBe(failed);
    const latestRatio=jest.fn();props={...props,attachment:{...props.attachment,width:400,height:300},onAspectRatio:latestRatio};
    await updateImage();
    expect(originalImage().props.onLoad).toBe(loaded);
    expect(originalImage().props.onError).toBe(failed);
    await act(async()=>loaded({source:{width:400,height:300}}));
    expect(latestRatio).toHaveBeenCalledWith(4/3);
    expect(props.resolve).toHaveBeenCalledTimes(1);
  });
  test('a retained copy cannot start downloading an original that has not loaded',async()=>{
    await renderImage('retained');
    expect(props.resolve).not.toHaveBeenCalled();
    expect(screen!.root.findAllByType('CachedImage' as any)).toHaveLength(0);
    await updateImage('visible');expect(props.resolve).toHaveBeenCalledTimes(1);
  });
  test('a warm photo cannot be restored through another account resolver',async()=>{
    await renderImage();await act(async()=>originalImage().props.onLoad({source:{width:400,height:300}}));
    props.resolve=jest.fn().mockResolvedValue({uri:'file://other-account.jpg'});
    await act(async()=>screen!.update(imageTree('retained','other-account')));
    expect(screen!.root.findAllByType('CachedImage' as any)).toHaveLength(0);
    expect(props.resolve).not.toHaveBeenCalled();
  });
  test('recycled source identity includes the attachment URL even when its id is unchanged',async()=>{
    props.attachment={...file,url:'file://old.jpg'};await renderImage();
    const oldLoad=originalImage().props.onLoad;
    await act(async()=>oldLoad({source:{width:400,height:300}}));
    props.attachment={...file,url:'file://replacement.jpg'};await updateImage('deferred');
    await act(async()=>oldLoad({source:{width:400,height:300}}));
    expect(screen!.root.findAllByType('CachedImage' as any)).toHaveLength(0);
    expect(imageCache.read(props.resolve,props.attachment)).toBeUndefined();
  });
  test('an evicted warm image refreshes its authorised source once, while a failed retry stays failed',async()=>{
    await renderImage();await act(async()=>originalImage().props.onLoad({source:{width:400,height:300}}));
    await act(async()=>screen!.update(imageTree('visible','recycled')));
    props.resolve.mockResolvedValue({uri:'file://refreshed.jpg'});
    await act(async()=>originalImage().props.onError({error:'Cache was evicted'}));
    expect(props.resolve).toHaveBeenCalledTimes(2);
    expect(originalImage().props.source.uri).toBe('file://refreshed.jpg');
    await act(async()=>originalImage().props.onError({error:'Unavailable'}));
    expect(props.resolve).toHaveBeenCalledTimes(2);expect(byLabel('Изображение недоступно')).toBeDefined();
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
    await renderGallery(); const stage = byId('help-gallery-gesture');
    act(() => {stage.props.onPanResponderGrant(null);stage.props.onPanResponderMove(null, { dx:0,dy:180 });});
    act(() => stage.props.onPanResponderTerminate()); expect(props.onClose).not.toHaveBeenCalled();
    act(() => {stage.props.onPanResponderGrant(null);stage.props.onPanResponderMove(null,{dx:0,dy:140});stage.props.onPanResponderRelease(null, { dx:0,dy:140,vy:0 });});
    act(() => byLabel('Закрыть изображение').props.onPress());
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
  const galleryTransform=(name:string)=>StyleSheet.flatten(byId('help-gallery-transition').props.style).transform.find((entry:any)=>name in entry)[name].__getValue();
  const galleryCurrent=()=>screen!.root.findAll(n=>n.props.testID==='help-gallery-cell').find(node=>node.props.accessibilityLabel==='Текущее изображение')!.findByType(HelpImage).props.attachment.id;
  const galleryDrag=(dx:number,dy:number)=>{const surface=byId('help-gallery-gesture');surface.props.onPanResponderGrant(null);surface.props.onPanResponderMove(null,{dx,dy});return surface;};
  test('gallery touch overlay owns native touch-down and follows a downward pull without fading the photo',async()=>{
    await renderGallery();const surface=byId('help-gallery-gesture');
    expect(surface.props).toMatchObject({collapsable:false,pointerEvents:'box-only'});expect(surface.props.onStartShouldSetPanResponder()).toBe(true);expect(surface.props.onPanResponderTerminationRequest()).toBe(false);
    expect(byId('help-gallery-stage').props.onPanResponderMove).toBeUndefined();
    await act(async()=>{surface.props.onPanResponderGrant(null);surface.props.onPanResponderMove(null,{dx:4,dy:1});surface.props.onPanResponderMove(null,{dx:2,dy:100});});
    expect(galleryTransform('translateY')).toBe(100);expect(galleryTransform('scale')).toBeLessThan(1);
    expect(StyleSheet.flatten(byId('help-gallery-transition').props.style).opacity.__getValue()).toBe(1);
    expect(StyleSheet.flatten(byId('help-gallery-backdrop').props.style).opacity.__getValue()).toBeLessThan(1);expect(props.onClose).not.toHaveBeenCalled();
    expect(StyleSheet.flatten(byId('help-gallery-transition').props.style).overflow).toBe('hidden');
  });
  test('gallery horizontal swipes page both directions and never dismiss a diagonal paging gesture',async()=>{
    await renderGallery();
    await act(async()=>{const surface=galleryDrag(-200,20);surface.props.onPanResponderRelease(null,{dx:-200,dy:120,vx:-1,vy:.5});});
    expect(galleryCurrent()).toBe('photo-2');expect(props.onClose).not.toHaveBeenCalled();expect(galleryTransform('translateY')).toBe(0);
    await act(async()=>{const surface=galleryDrag(200,2);surface.props.onPanResponderRelease(null,{dx:200,dy:2,vx:1,vy:0});});
    expect(galleryCurrent()).toBe('photo-1');expect(props.onClose).not.toHaveBeenCalled();
  });
  test('gallery short pull springs back and boundary paging never wraps around',async()=>{
    await renderGallery();
    await act(async()=>{const surface=galleryDrag(3,35);surface.props.onPanResponderRelease(null,{dx:3,dy:35,vx:0,vy:0});});
    expect(galleryTransform('translateY')).toBe(0);expect(galleryTransform('scale')).toBe(1);expect(props.onClose).not.toHaveBeenCalled();
    await act(async()=>{const surface=galleryDrag(180,2);surface.props.onPanResponderRelease(null,{dx:180,dy:2,vx:1,vy:0});});
    expect(galleryCurrent()).toBe('photo-1');expect(StyleSheet.flatten(byId('help-gallery-pager').props.style).transform[0].translateX.__getValue()).toBe(0);
  });
  test('gallery mounts only the selected image and its immediate neighbors',async()=>{
    await renderGallery({attachments:Array.from({length:20},(_,i)=>({...file,id:`image-${i}`})),initialIndex:10});
    expect(screen!.root.findAllByType(HelpImage)).toHaveLength(3);expect(galleryCurrent()).toBe('image-10');
    await act(async()=>byLabel('Следующее изображение').props.onPress());expect(galleryCurrent()).toBe('image-11');
    expect(screen!.root.findAllByType(HelpImage)).toHaveLength(3);
  });
  test('gallery retains the decoded next image in the same absolute cell after paging',async()=>{
    await renderGallery();
    const before=screen!.root.findAllByType(HelpImage).find(image=>image.props.attachment.id==='photo-2')!;
    const parent=before.parent!.parent!;
    const left=StyleSheet.flatten(parent.props.style).left;
    await act(async()=>byLabel('Следующее изображение').props.onPress());
    const after=screen!.root.findAllByType(HelpImage).find(image=>image.props.attachment.id==='photo-2')!;
    expect(after).toBe(before);expect(StyleSheet.flatten(parent.props.style).left).toBe(left);
  });
  test('gallery pinch and zoomed panning take precedence over dismiss and paging',async()=>{
    await renderGallery();const surface=byId('help-gallery-gesture');
    const two=(distance:number)=>({nativeEvent:{touches:[{pageX:0,pageY:0},{pageX:distance,pageY:0}]}});
    await act(async()=>{surface.props.onPanResponderGrant(two(20));surface.props.onPanResponderMove(two(50),{dx:0,dy:0});surface.props.onPanResponderRelease(two(50),{dx:0,dy:0,vx:0,vy:0});});
    await act(async()=>{const current=galleryDrag(-200,180);current.props.onPanResponderRelease(null,{dx:-200,dy:180,vx:-1,vy:1});});
    expect(galleryCurrent()).toBe('photo-1');expect(props.onClose).not.toHaveBeenCalled();expect(galleryTransform('translateY')).toBe(0);
  });
  test('gallery touch overlay supports double-tap zoom/reset without swallowing toolbar buttons',async()=>{
    await renderGallery();const surface=byId('help-gallery-gesture'),event={nativeEvent:{touches:[{pageX:100,pageY:200}],changedTouches:[{pageX:100,pageY:200}]}},g={dx:0,dy:0,vx:0,vy:0};
    const tap=()=>{surface.props.onPanResponderGrant(event);surface.props.onPanResponderRelease(event,g);};
    const zoomScale=()=>screen!.root.findAll(n=>n.props.testID==='help-gallery-cell').find(node=>node.props.accessibilityLabel==='Текущее изображение')!.props.style.transform[2].scale.__getValue();
    await act(async()=>{tap();now=180;tap();});expect(zoomScale()).toBe(2.5);expect(props.onClose).not.toHaveBeenCalled();
    await act(async()=>{now=500;tap();now=650;tap();});expect(zoomScale()).toBe(1);
    await act(async()=>byLabel('Следующее изображение').props.onPress());expect(galleryCurrent()).toBe('photo-2');
    await act(async()=>byLabel('Закрыть изображение').props.onPress());expect(props.onClose).toHaveBeenCalledTimes(1);
  });
  test('external page selection cancels stale paging completion and never reuses another photo origin',async()=>{
    mockReduced=false;const jobs:{done?:(event:{finished:boolean})=>void}[]=[];
    jest.spyOn(Animated,'timing').mockImplementation(()=>({start:(done?:any)=>jobs.push({done}),stop:jest.fn(),reset:jest.fn()} as any));
    await renderGallery({attachments:[0,1,2].map(id=>({...file,id:`photo-${id}`})),origin:{x:40,y:400,width:100,height:100}});
    await act(async()=>{const surface=galleryDrag(-180,2);surface.props.onPanResponderRelease(null,{dx:-180,dy:2,vx:-1,vy:0});});const old=jobs.at(-1)!.done;
    props={...props,initialIndex:2};await act(async()=>screen!.update(React.createElement(HelpGallery,props)));
    expect(galleryCurrent()).toBe('photo-2');expect(galleryTransform('translateY')).toBe(0);expect(galleryTransform('scale')).toBe(1);
    await act(async()=>old?.({finished:true}));expect(galleryCurrent()).toBe('photo-2');
  });
  test('gallery page commit keeps the settled native offset and never rebases the loaded photo',async()=>{
    mockReduced=false;const jobs:{value:any;config:any;done?:(event:{finished:boolean})=>void}[]=[];
    jest.spyOn(Animated,'timing').mockImplementation((value:any,config:any)=>({start:(done?:any)=>{jobs.push({value,config,done});},stop:jest.fn(),reset:jest.fn()} as any));
    await renderGallery();
    await act(async()=>{const surface=galleryDrag(-180,2);surface.props.onPanResponderRelease(null,{dx:-180,dy:2,vx:-1,vy:0});});
    expect(galleryCurrent()).toBe('photo-1');expect(jobs.at(-1)!.config).toMatchObject({toValue:-300,duration:180,useNativeDriver:true});
    await act(async()=>{const job=jobs.at(-1)!;job.value.setValue(job.config.toValue);job.done?.({finished:true});});
    expect(galleryCurrent()).toBe('photo-2');expect(StyleSheet.flatten(byId('help-gallery-pager').props.style).transform[0].translateX.__getValue()).toBe(-300);
  });
  test('gallery cancelled native paging never changes the current photo',async()=>{
    mockReduced=false;const jobs:{done?:(event:{finished:boolean})=>void}[]=[];
    jest.spyOn(Animated,'timing').mockImplementation(()=>({start:(done?:any)=>jobs.push({done}),stop:jest.fn(),reset:jest.fn()} as any));
    await renderGallery();
    await act(async()=>{const surface=galleryDrag(-180,2);surface.props.onPanResponderRelease(null,{dx:-180,dy:2,vx:-1,vy:0});});
    await act(async()=>jobs.at(-1)!.done?.({finished:false}));expect(galleryCurrent()).toBe('photo-1');expect(props.onClose).not.toHaveBeenCalled();
  });
  test('gallery empty input remains closable and cannot download',async()=>{
    await renderGallery({attachments:[],initialIndex:100});expect(byLabel('Скачать').props.disabled).toBe(true);
    await act(async()=>byLabel('Закрыть изображение').props.onPress());expect(props.onClose).toHaveBeenCalledTimes(1);
  });
  test.each([true,false])('gallery downward dismissal keeps following the finger until animation completion (tile=%s)',async(hasOrigin)=>{
    mockReduced=false;let finishAnimation:undefined|(()=>void);
    jest.spyOn(Animated,'timing').mockImplementation((value:any,config:any)=>({start:(done?:any)=>{value.setValue(config.toValue);done?.({finished:true});},stop:jest.fn(),reset:jest.fn()} as any));
    jest.spyOn(Animated,'parallel').mockImplementation((animations:any)=>({start:(done?:any)=>{finishAnimation=()=>{animations.forEach((animation:any)=>animation.start());done?.({finished:true});};},stop:jest.fn(),reset:jest.fn()} as any));
    await renderGallery(hasOrigin?{origin:{x:40,y:420,width:100,height:100}}:{});
    await act(async()=>{const surface=galleryDrag(2,150);surface.props.onPanResponderRelease(null,{dx:2,dy:150,vx:0,vy:1});});
    expect(galleryTransform('translateY')).toBe(150);expect(props.onClose).not.toHaveBeenCalled();
    await act(async()=>finishAnimation!());expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(StyleSheet.flatten(byId('help-gallery-backdrop').props.style).opacity.__getValue()).toBe(0);
    const transforms=StyleSheet.flatten(byId('help-gallery-transition').props.style).transform;
    expect(transforms.some((entry:any)=>'scaleX'in entry||'scaleY'in entry)).toBe(false);
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
