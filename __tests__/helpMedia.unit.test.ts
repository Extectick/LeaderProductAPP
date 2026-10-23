import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Animated, Image, PanResponder, Text } from 'react-native';

const mockPlayer = { replace: jest.fn(), play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() };
let mockStatus = { playing: false, currentTime: 0, duration: 10, playbackRate: 1, didJustFinish: false };
let mockReduced = true;
jest.mock('expo-audio', () => ({ useAudioPlayer: () => mockPlayer, useAudioPlayerStatus: () => mockStatus }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file://cache/', downloadAsync: jest.fn().mockResolvedValue({ status: 200, uri: 'file://image' }) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn().mockResolvedValue(true), shareAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 20, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('../src/features/help/helpTheme', () => ({ useHelpTheme: () => ({ muted: '#999999', accent: '#3388ff', accentText: '#68B0FF', elevated: '#333333' }), useHelpReducedMotion: () => mockReduced }));
jest.mock('../src/features/help/components/HelpPrimitives', () => ({ HelpIcon: 'HelpIcon' }));
import { HelpAudio, HelpGallery, HelpImage } from '../src/features/help/components/HelpMedia';

describe('Help media geometry and lifecycle', () => {
  let screen: TestRenderer.ReactTestRenderer | undefined;
  let props: any;
  let now = 0;
  let frames: Map<number, FrameRequestCallback>;
  let frameId = 0;
  const file = { id: 'photo-1', kind: 'IMAGE', name: 'Снимок.jpg', size: 128, mimeType: 'image/jpeg' } as any;
  beforeEach(() => {
    frames = new Map(); now = 0; mockReduced = true;
    mockStatus = { playing: false, currentTime: 0, duration: 10, playbackRate: 1, didJustFinish: false };
    mockPlayer.replace.mockReset(); mockPlayer.play.mockReset(); mockPlayer.pause.mockReset(); mockPlayer.seekTo.mockReset().mockResolvedValue(undefined);
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation(cb => { frames.set(++frameId, cb); return frameId; });
    jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
    jest.spyOn(PanResponder, 'create').mockImplementation(config => ({ panHandlers: config } as any));
    props = { attachment: file, resolve: jest.fn().mockResolvedValue({ uri: 'file://image.jpg' }), onError: jest.fn() };
  });
  afterEach(async () => { if (screen) await act(async () => screen!.unmount()); screen = undefined; jest.restoreAllMocks(); });
  const byId = (id: string) => screen!.root.findAll(n => n.props.testID === id)[0];
  const byLabel = (label: string) => screen!.root.findAll(n => n.props.label === label || n.props.accessibilityLabel === label)[0];
  async function renderAudio() { await act(async () => { screen = TestRenderer.create(React.createElement(HelpAudio, props)); }); }
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
    mockStatus.playing = true; mockStatus.currentTime = 2; await renderAudio();
    await tick(50); expect(parseFloat(byId('help-audio-progress').props.style.width)).toBeCloseTo(20.5);
    await tick(75); expect(parseFloat(byId('help-audio-progress').props.style.width)).toBeCloseTo(20.75);
    mockStatus = { ...mockStatus, playing: false, currentTime: 2.1 };
    await act(async () => screen!.update(React.createElement(HelpAudio, props)));
    await tick(1000); expect(parseFloat(byId('help-audio-progress').props.style.width)).toBeCloseTo(21);
    expect(frames.size).toBe(0);
  });
  test('fixed decorative bars are hidden from accessibility and clipped by real progress', async () => {
    mockStatus.currentTime = 2.5; await renderAudio();
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
    await renderAudio();
    await act(async () => byId('help-audio-seek').props.onLayout({ nativeEvent: { layout: { width: 100 } } }));
    await act(async () => byId('help-audio-seek').props.onResponderGrant({ nativeEvent: { locationX: 200 } }));
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(10);
    await act(async () => byId('help-audio-seek').props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }));
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(5);
  });
  test('late audio resolution never replaces player or reports error after unmount', async () => {
    let reject!: (error: Error) => void;
    props.resolve.mockReturnValue(new Promise((_, no) => { reject = no; }));
    await renderAudio(); await act(async () => screen!.unmount()); screen = undefined;
    await act(async () => reject(new Error('gone')));
    expect(props.onError).not.toHaveBeenCalled(); expect(mockPlayer.replace).not.toHaveBeenCalled();
  });
  test('image reports actual positive aspect ratio and ignores malformed dimensions', async () => {
    props.onAspectRatio = jest.fn(); await act(async () => { screen = TestRenderer.create(React.createElement(HelpImage, props)); });
    const image = screen!.root.findByType(Image);
    act(() => image.props.onLoad({ nativeEvent: { source: { width: 400, height: 200 } } }));
    act(() => image.props.onLoad({ nativeEvent: { source: { width: 0, height: 0 } } }));
    expect(props.onAspectRatio).toHaveBeenCalledTimes(1); expect(props.onAspectRatio).toHaveBeenCalledWith(2);
  });
  test('web DOM image load uses intrinsic target dimensions without a native source', async () => {
    props.onAspectRatio = jest.fn(); await act(async () => { screen = TestRenderer.create(React.createElement(HelpImage, props)); });
    const image = screen!.root.findByType(Image);
    act(() => image.props.onLoad({ nativeEvent: { target: { naturalWidth: 900, naturalHeight: 600, width: 225, height: 225 } } }));
    expect(props.onAspectRatio).toHaveBeenLastCalledWith(1.5);
    act(() => image.props.onLoad({ currentTarget: { naturalWidth: 400, naturalHeight: 800 } }));
    expect(props.onAspectRatio).toHaveBeenLastCalledWith(0.5);
    expect(() => act(() => image.props.onLoad({ nativeEvent: {} }))).not.toThrow();
    expect(props.onAspectRatio).toHaveBeenCalledTimes(2);
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
