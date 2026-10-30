import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { HelpMessage } from '../src/features/help/helpApi';

jest.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark' }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('../src/features/help/helpDiagnostics', () => ({ helpDevState: jest.fn() }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { View: require('react-native').View },
  useSharedValue: (value: number) => require('react').useRef({ value }).current,
  useAnimatedStyle: (fn: () => unknown) => fn(), cancelAnimation: jest.fn(),
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  withTiming: jest.fn((value: number) => value),
  Easing: { out: (fn: unknown) => fn, quad: () => 0 },
}));
import { StyleSheet } from 'react-native';
import { withTiming } from 'react-native-reanimated';
import { HelpAssistantMessage } from '../src/features/help/components/HelpAssistantMessage';

const message = {
  id: 1, ticketId: 1043, createdAt: '2026-10-30T10:00:00Z', text: '',
  assistantRun: { runId: 'surface-1', eventId: 1, ticketId: 1043, status: 'thinking', step: 1, completedSteps: 1, startedAt: 0, updatedAt: 0 },
} as HelpMessage;

test('height and fixed rounded corners share one resize through streaming, completion and stop', async () => {
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => { view = TestRenderer.create(React.createElement(HelpAssistantMessage, { message })); });
  try {
    const surface = () => view.root.findAllByProps({ testID: 'help-assistant-surface' })[0];
    const measure = async (height: number) => act(async () => {
      view.root.findAllByProps({ testID: 'help-assistant-body' })[0].props.onLayout({ nativeEvent: { layout: { height } } });
    });
    expect(StyleSheet.flatten(surface().props.style).height).toBeUndefined();
    await measure(64);
    const originalSurface = surface();
    await act(async () => view.update(React.createElement(HelpAssistantMessage, {
      message: { ...message, text: 'Ответ с новой строкой', assistantRun: { ...message.assistantRun!, status: 'streaming' } },
    })));
    await measure(108);
    expect(withTiming).toHaveBeenLastCalledWith(108, expect.objectContaining({ duration: 150 }), expect.any(Function));
    expect(view.root.findAllByProps({ testID: 'help-assistant-message' })[0].props.style.height).toBe(108);
    for (const status of ['completed', 'stopped'] as const) {
      await act(async () => view.update(React.createElement(HelpAssistantMessage, {
        message: { ...message, text: 'Готовый ответ', assistantRun: { ...message.assistantRun!, status } },
      })));
      expect(surface()).toBe(originalSurface);
      expect(StyleSheet.flatten(surface().props.style).height).toBe(108);
      const corners = StyleSheet.flatten(view.root.findAllByProps({ testID: 'help-assistant-bottom-corners' })[0].props.style);
      expect(corners).toEqual(expect.objectContaining({ height: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }));
      expect(corners.transform).toEqual([{ translateY: 92 }]);
    }
    await measure(72);
    expect(withTiming).toHaveBeenLastCalledWith(72, expect.objectContaining({ duration: 150 }), expect.any(Function));
    // Shrinking keeps the old bounds until the UI animation actually finishes.
    expect(view.root.findAllByProps({ testID: 'help-assistant-message' })[0].props.style.height).toBe(108);
    const finish = (withTiming as jest.Mock).mock.calls.at(-1)![2];
    await act(async () => finish(true));
    expect(view.root.findAllByProps({ testID: 'help-assistant-message' })[0].props.style.height).toBe(72);
    await measure(140);
    await act(async () => finish(true));
    expect(view.root.findAllByProps({ testID: 'help-assistant-message' })[0].props.style.height).toBe(140);
    expect(view.root.findAllByProps({ testID: 'help-assistant-message' })[0].props.style.overflow).toBeUndefined();
  } finally { await act(async () => view.unmount()); }
});

test('a cached completed answer has no guessed height or absolute measurement pass', async () => {
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => { view = TestRenderer.create(React.createElement(HelpAssistantMessage, {
    message: { ...message, text: 'Длинный сохранённый ответ', assistantRun: { ...message.assistantRun!, status: 'completed' } },
  })); });
  const surface = view.root.findAllByProps({ testID: 'help-assistant-surface' })[0];
  expect(StyleSheet.flatten(surface.props.style).height).toBeUndefined();
  expect(view.root.findAllByProps({ testID: 'help-assistant-body' })[0].props.style).toBeUndefined();
  expect(view.root.findAllByProps({ testID: 'help-assistant-body' })[0].props.onLayout).toBeUndefined();
  await act(async () => view.unmount());
});

test('first streamed words keep the reasoning height and do not restart a fade', async () => {
  let view!: TestRenderer.ReactTestRenderer;
  let current = message;
  await act(async () => { view = TestRenderer.create(React.createElement(HelpAssistantMessage, { message: current })); });
  try {
    const measure = async (height: number) => act(async () => {
      view.root.findAllByProps({ testID: 'help-assistant-body' })[0].props.onLayout({ nativeEvent: { layout: { height } } });
    });
    await measure(140);
    current = { ...message, text: 'Начнём', assistantRun: { ...message.assistantRun!, status: 'streaming' } };
    await act(async () => view.update(React.createElement(HelpAssistantMessage, { message: current })));
    await measure(62);
    await measure(84);
    const row = view.root.findAllByProps({ testID: 'help-assistant-message' })[0];
    expect(row.props.style.height).toBe(140);
    expect(row.props.style.opacity).toBeUndefined();
    await act(async () => view.update(React.createElement(HelpAssistantMessage, { message: current })));
    expect(StyleSheet.flatten(view.root.findAllByProps({ testID: 'help-assistant-surface' })[0].props.style).height).toBe(140);
  } finally { await act(async () => view.unmount()); }
});

test('the timestamp follows the animated bottom outside the clipped text', async () => {
  let view!: TestRenderer.ReactTestRenderer;
  const current = { ...message, text: 'Текст ответа', assistantRun: { ...message.assistantRun!, status: 'streaming' as const } };
  await act(async () => { view = TestRenderer.create(React.createElement(HelpAssistantMessage, { message: current })); });
  try {
    const measure = async (height: number) => {
      await act(async () => view.root.findAllByProps({ testID: 'help-assistant-body' })[0].props.onLayout({ nativeEvent: { layout: { height } } }));
      // The test mock reruns UI worklets on render.
      await act(async () => view.update(React.createElement(HelpAssistantMessage, { message: current })));
    };
    await measure(84);
    const clip = view.root.findAllByProps({ testID: 'help-assistant-content-clip' })[0];
    expect(clip.findAllByProps({ testID: 'help-assistant-time' })).toHaveLength(0);
    expect(clip.props.style.bottom).toBe(28);
    const stamp = () => StyleSheet.flatten(view.root.findAllByProps({ testID: 'help-assistant-time' })[0].props.style);
    expect(stamp().transform).toEqual([{ translateY: 60 }]);
    await measure(106);
    expect(stamp().transform).toEqual([{ translateY: 82 }]);
  } finally { await act(async () => view.unmount()); }
});
