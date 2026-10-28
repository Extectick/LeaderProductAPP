import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { AudioStatus } from 'expo-audio';
const mockPlayer = { pause: jest.fn(), play: jest.fn(), replace: jest.fn(), seekTo: jest.fn(), setPlaybackRate: jest.fn(), shouldCorrectPitch: false };
let mockStatus: AudioStatus;
const mockMode = jest.fn();
jest.mock('expo-audio', () => ({ useAudioPlayer: jest.fn(() => mockPlayer), useAudioPlayerStatus: () => mockStatus, setAudioModeAsync: (...args: unknown[]) => mockMode(...args) }));
import { HelpAudioPlaybackProvider, useHelpAudioController, useHelpAudioPlayback, useHelpAudioCommands, type HelpAudioCommands, type HelpAudioItem, type HelpAudioPlaybackController } from '../src/features/help/HelpAudioPlayback';

const item = (id: number, ticketId = 7): HelpAudioItem => ({ attachment: { id: `voice-${id}`, name: 'Голосовое.m4a', kind: 'AUDIO', mimeType: 'audio/mp4', size: 100, url: `/help/attachments/${id}/content` }, messageId: id, author: 'Анна', createdAt: '2026-10-28T10:00:00Z', ticketId });
const blankStatus = () => ({ currentTime: 0, duration: 0, playing: false, isLoaded: false, isBuffering: false, didJustFinish: false, playbackRate: 1, error: null } as AudioStatus);
let controller: HelpAudioPlaybackController, rowController: HelpAudioPlaybackController | null;
let commands: HelpAudioCommands | null, commandRenders = 0;
let screen: TestRenderer.ReactTestRenderer | undefined;
let props: { userId: number | null; ticketId: number | null; row: boolean; onError: jest.Mock };
function Row() { rowController = useHelpAudioPlayback(); return null; }
const Commands = React.memo(function Commands() { commands = useHelpAudioCommands(); commandRenders++; return null; });
function Harness(options: typeof props) {
  controller = useHelpAudioController(options);
  return React.createElement(HelpAudioPlaybackProvider, { value: controller, children: React.createElement(React.Fragment, null, React.createElement(Commands), options.row ? React.createElement(Row) : null) });
}
async function render() { await act(async () => { screen = TestRenderer.create(React.createElement(Harness, props)); }); }
async function update(changes: Partial<typeof props> = {}) { props = { ...props, ...changes }; await act(async () => { screen!.update(React.createElement(Harness, props)); }); }
async function status(changes: Partial<AudioStatus>) { mockStatus = { ...mockStatus, ...changes }; await update(); }
async function start(id = 1) { await act(async () => { await controller.play(item(id), async () => ({ uri: `file://voice-${id}.m4a` })); }); await status({ isLoaded: true, duration: 20, playing: true }); }
beforeEach(() => {
  for (const fn of Object.values(mockPlayer)) if (jest.isMockFunction(fn)) fn.mockReset();
  mockPlayer.seekTo.mockResolvedValue(undefined); mockMode.mockReset().mockResolvedValue(undefined);
  mockStatus = blankStatus(); props = { userId: 1, ticketId: 7, row: true, onError: jest.fn() }; rowController = null; commands = null; commandRenders = 0;
});
afterEach(async () => { if (screen) await act(async () => screen!.unmount()); screen = undefined; jest.restoreAllMocks(); });

test('mounting rows loads no audio and recycling the active row keeps the shared player running', async () => {
  await render(); expect(mockPlayer.replace).not.toHaveBeenCalled(); expect(controller.current).toBeNull();
  await start(); expect(rowController?.current?.messageId).toBe(1);
  mockPlayer.pause.mockClear(); mockPlayer.replace.mockClear(); await update({ row: false });
  expect(controller.current?.messageId).toBe(1); expect(controller.playing).toBe(true); expect(mockPlayer.pause).not.toHaveBeenCalled(); expect(mockPlayer.replace).not.toHaveBeenCalled();
  await update({ row: true }); expect(rowController?.current?.messageId).toBe(1);
});
test('the row and bar share status, pause/resume, and progress', async () => {
  await render(); await start(); await status({ currentTime: 5 });
  expect(controller).toMatchObject({ positionSeconds: 5, durationSeconds: 20, progress: .25, ready: true, playing: true });
  await act(async () => { await rowController!.toggle(); }); expect(mockPlayer.pause).toHaveBeenCalled(); expect(controller.playing).toBe(false);
  await act(async () => { await controller.toggle(); }); expect(controller.playing).toBe(true);
});
test('commands-only consumers do not rerender on playback progress or speed changes', async () => {
  await render(); const initial=commands, renders=commandRenders;
  await start(); await status({currentTime:3}); await act(async()=>controller.setSpeed(1.5));await status({currentTime:4,playbackRate:1.5});
  expect(commands).toBe(initial);expect(commandRenders).toBe(renders);
});
test('speed is pitch-corrected and retained between tracks, then reset with the account scope', async () => {
  await render(); await start(); await act(async () => controller.setSpeed(1.5));
  expect(mockPlayer.setPlaybackRate).toHaveBeenLastCalledWith(1.5, 'medium'); expect(mockPlayer.shouldCorrectPitch).toBe(true);
  await start(2); expect(controller.speed).toBe(1.5);
  await act(async () => controller.setSpeed(2)); expect(controller.speed).toBe(2);
  await update({ userId: 2 }); expect(controller.current).toBeNull(); expect(controller.speed).toBe(1); expect(mockPlayer.replace).toHaveBeenLastCalledWith(null);
});
test('late resolution cannot replace the newest track or revoke a resolver-owned cached URL', async () => {
  await render(); const revoke = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  let finish!: (source: { uri: string }) => void; let older!: Promise<void>;
  await act(async () => { older = controller.play(item(1), () => new Promise(done => { finish = done; })); });
  await start(2); mockPlayer.replace.mockClear(); mockPlayer.play.mockClear();
  await act(async () => { finish({ uri: 'blob:stale-voice' }); await older; });
  expect(controller.current?.messageId).toBe(2); expect(mockPlayer.replace).not.toHaveBeenCalled(); expect(mockPlayer.play).not.toHaveBeenCalled(); expect(revoke).not.toHaveBeenCalled();
});

test('a cached blob remains reusable after stop, another track, and controller unmount', async () => {
  const revoke = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const source = { uri: 'blob:cached-voice' }, cached = Promise.resolve(source);
  const resolve = jest.fn(() => cached);
  await render();
  await act(async () => { await controller.play(item(1), resolve); });
  await act(async () => controller.stop());
  await act(async () => { await controller.play(item(1), resolve); });
  await start(2);
  await act(async () => { await controller.play(item(1), resolve); });
  expect(resolve).toHaveBeenCalledTimes(3);
  expect(mockPlayer.replace.mock.calls.filter(([value]) => value === source)).toHaveLength(3);
  expect(controller.current?.messageId).toBe(1);
  await act(async () => screen!.unmount()); screen = undefined;
  expect(mockPlayer.replace).toHaveBeenLastCalledWith(null);
  expect(revoke).not.toHaveBeenCalled();
});

test('preparation failure does not invalidate a cached blob before retry', async () => {
  const revoke = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const source = { uri: 'blob:cached-retry' };
  const resolve = jest.fn(async () => source);
  mockMode.mockRejectedValueOnce(new Error('temporary audio mode failure'));
  await render();
  await act(async () => { await controller.play(item(1), resolve); });
  expect(controller.error).toBeTruthy();
  await act(async () => { await controller.toggle(); });
  expect(mockPlayer.replace).toHaveBeenLastCalledWith(source);
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  expect(revoke).not.toHaveBeenCalled();
});
test.each(['close', 'ticket', 'account', 'unmount'])('%s invalidates an in-flight media resolution', async reason => {
  const revoke = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  await render(); let finish!: (source: { uri: string }) => void; let pending!: Promise<void>;
  await act(async () => { pending = controller.play(item(1), () => new Promise(done => { finish = done; })); });
  if (reason === 'close') await act(async () => controller.stop());
  else if (reason === 'ticket') await update({ ticketId: 8 });
  else if (reason === 'account') await update({ userId: 2 });
  else { await act(async () => screen!.unmount()); screen = undefined; }
  mockPlayer.play.mockClear(); mockPlayer.replace.mockClear();
  await act(async () => { finish({ uri: 'blob:pending-cached-voice' }); await pending; });
  expect(mockPlayer.play).not.toHaveBeenCalled(); expect(mockPlayer.replace).not.toHaveBeenCalled(); expect(props.onError).not.toHaveBeenCalled(); expect(revoke).not.toHaveBeenCalled();
});
test('stale event handlers and audio from a different ticket cannot start playback', async () => {
  await render(); const oldPlay = controller.play; await update({ ticketId: 8 });
  const resolve = jest.fn(async () => ({ uri: 'file://old' }));
  await act(async () => { await oldPlay(item(1), resolve); await controller.play(item(1), resolve); });
  expect(resolve).not.toHaveBeenCalled(); expect(controller.current).toBeNull();
});
test('pause during loading is respected when the resolver eventually completes', async () => {
  await render(); let finish!: (source: { uri: string }) => void; let pending!: Promise<void>;
  await act(async () => { pending = controller.play(item(1), () => new Promise(done => { finish = done; })); });
  await act(async () => { await controller.toggle(); finish({ uri: 'file://voice' }); await pending; });
  expect(mockPlayer.play).not.toHaveBeenCalled();
  await status({ isLoaded: true, duration: 20 }); await act(async () => { await controller.toggle(); }); expect(mockPlayer.play).toHaveBeenCalledTimes(1);
});
test('drag seeks coalesce, clamp, and keep the latest requested position during native updates', async () => {
  await render(); await start(); let finish!: () => void;
  mockPlayer.seekTo.mockReturnValueOnce(new Promise<void>(done => { finish = done; }));
  let first!: Promise<void>, last!: Promise<void>;
  await act(async () => { first = controller.seek(4); });
  await act(async () => { void controller.seek(7); last = controller.seek(99); });
  await status({ currentTime: 4 }); expect(controller.positionSeconds).toBe(20);
  await act(async () => { finish(); await first; await last; });
  expect(mockPlayer.seekTo.mock.calls.map(call => call[0])).toEqual([4, 20]);
});
test('new source waits for an older in-flight seek, so its completion cannot seek the new track', async () => {
  await render(); await start(); let finish!: () => void;
  mockPlayer.seekTo.mockReturnValueOnce(new Promise<void>(done => { finish = done; }));
  let seeking!: Promise<void>, playing!: Promise<void>;
  await act(async () => { seeking = controller.seek(4); });
  mockPlayer.replace.mockClear();
  await act(async () => { playing = controller.play(item(2), async () => ({ uri: 'file://second' })); });
  expect(mockPlayer.replace).toHaveBeenCalledWith(null); expect(mockPlayer.replace).not.toHaveBeenCalledWith({ uri: 'file://second' });
  await act(async () => { finish(); await seeking; await playing; }); expect(mockPlayer.replace).toHaveBeenLastCalledWith({ uri: 'file://second' });
});
test('replaying a finished voice rewinds first and stop clears all metadata', async () => {
  await render(); await start(); await status({ currentTime: 20, playing: false, didJustFinish: true });
  await act(async () => { await controller.toggle(); }); expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(0); expect(controller.positionSeconds).toBe(0);
  await act(async () => controller.stop()); expect(controller).toMatchObject({ current: null, playing: false, durationSeconds: 0, loading: false });
});
test('load failure reports a generic actionable error and toggle retries with the saved resolver', async () => {
  await render(); const resolve = jest.fn().mockRejectedValueOnce(new Error('private source URL')).mockResolvedValue({ uri: 'file://retry' });
  await act(async () => { await controller.play(item(1), resolve); });
  expect(controller.error).toBe('Не удалось загрузить голосовое сообщение'); expect(props.onError).toHaveBeenCalledWith('Не удалось загрузить голосовое сообщение');
  await act(async () => { await controller.toggle(); }); expect(resolve).toHaveBeenCalledTimes(2); expect(mockPlayer.play).toHaveBeenCalled(); expect(controller.error).toBeNull();
});
