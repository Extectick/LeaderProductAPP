import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Animated } from 'react-native';
import type { HelpAudioPlaybackController } from '../src/features/help/HelpAudioPlayback';
let mockReduced = false;
jest.mock('../src/features/help/helpTheme', () => ({ useHelpReducedMotion: () => mockReduced, useHelpTheme: () => ({ headerSurface: '#FFFFFF' }) }));
jest.mock('../src/features/help/helpDiagnostics', () => ({ helpDevActions: () => undefined, helpDevRef: jest.fn(), helpDevState: jest.fn() }));
jest.mock('../src/features/help/components/HelpVoicePlaybackBar', () => ({ HelpVoicePlaybackBar: 'VoiceBar', HELP_VOICE_PLAYBACK_BAR_HEIGHT: 44 }));
jest.mock('expo-audio', () => ({ useAudioPlayer: jest.fn(), useAudioPlayerStatus: jest.fn(), setAudioModeAsync: jest.fn() }));
import { HelpPlaybackPresence } from '../src/features/help/components/HelpPlaybackScope';

const audio = (id: number): HelpAudioPlaybackController => ({
  current: { messageId: id, author: `User ${id}`, createdAt: '', ticketId: 7, attachment: { id: `voice-${id}`, kind: 'AUDIO' } as any },
  positionSeconds: 2, durationSeconds: 8, progress: .25, playing: true, loading: false, ready: true, error: null, speed: 1,
  play: jest.fn(), toggle: jest.fn(), seek: jest.fn(), setSpeed: jest.fn(), stop: jest.fn(),
});
let screen: TestRenderer.ReactTestRenderer;
let completions: Array<(result: { finished: boolean }) => void>;
let timing: jest.SpyInstance;
const jump = jest.fn();
const render = async (value: HelpAudioPlaybackController | null) => {
  await act(async () => { screen = TestRenderer.create(React.createElement(HelpPlaybackPresence, { audio: value, onJump: jump })); });
};
const update = async (value: HelpAudioPlaybackController | null) => {
  await act(async () => screen.update(React.createElement(HelpPlaybackPresence, { audio: value, onJump: jump })));
};
const bars = () => screen.root.findAllByType('VoiceBar' as any);
beforeEach(() => {
  mockReduced = false; completions = [];
  timing = jest.spyOn(Animated, 'timing').mockImplementation(() => ({ start: callback => { if (callback) completions.push(callback); }, stop: jest.fn(), reset: jest.fn() }));
});
afterEach(async () => { if (screen) await act(async () => screen.unmount()); jest.restoreAllMocks(); });

test('closing retains only the latest disabled visual until the exit completes', async () => {
  const current = audio(1); await render(current);
  await update({ ...current, positionSeconds: 7 });
  await update(null);
  expect(bars()[0].props.positionSeconds).toBe(7);
  const viewport = screen.root.findByProps({ testID: 'help-voice-playback-presence' });
  expect(viewport.props.pointerEvents).toBe('none'); expect(viewport.props.accessibilityElementsHidden).toBe(true);
  await act(async () => { bars()[0].props.onToggle(); bars()[0].props.onClose(); completions[completions.length - 1]!({ finished: true }); });
  expect(current.toggle).not.toHaveBeenCalled(); expect(current.stop).not.toHaveBeenCalled(); expect(bars()).toHaveLength(0);
});
test('pause keeps the strip and a stale exit cannot remove a newly started track', async () => {
  const current = audio(1); await render(current);
  const count = timing.mock.calls.length;
  await update({ ...current, playing: false });
  expect(bars()).toHaveLength(1); expect(timing.mock.calls.length).toBe(count);
  await update(null); const oldExit = completions[completions.length - 1]!;
  await update(audio(2));
  await act(async () => oldExit({ finished: true }));
  expect(bars()[0].props.author).toBe('User 2');
});
test('reduced motion closes immediately without scheduling animation', async () => {
  mockReduced = true; await render(audio(1)); await update(null);
  expect(bars()).toHaveLength(0); expect(timing).not.toHaveBeenCalled();
});
