import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import type { HelpMessage } from '../src/features/help/helpApi';
import type { HelpPending } from '../src/features/help/helpDurableTypes';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('../src/features/help/helpTheme', () => ({ useHelpReducedMotion: () => false, useHelpTheme: () => ({ surface: '#222', text: '#fff', muted: '#999', outgoing: '#234', accentText: '#68b', danger: '#f99' }) }));
jest.mock('../src/features/help/components/HelpPrimitives', () => ({ HelpIcon: 'HelpIcon', HelpAvatar: 'HelpAvatar' }));
jest.mock('../src/features/help/components/HelpMedia', () => ({ HelpAudio: 'HelpAudio', HelpImage: 'HelpImage' }));
import { HelpMessageBubble } from '../src/features/help/components/HelpMessageBubble';
import { HelpPendingMessage } from '../src/features/help/components/HelpPendingMessage';

const message = { id: 1, ticketId: 4, authorId: 7, kind: 'TEXT', text: '123', createdAt: '2026-10-31T10:49:00Z', attachments: [], reactions: [] } as unknown as HelpMessage;
const props = { message, userId: 7, open: true, canInteract: true, selected: false, highlighted: false, solution: false,
  resolve: jest.fn(), onMenu: jest.fn(), onDismissMenu: jest.fn(), onReply: jest.fn(), onCopy: jest.fn(), onEdit: jest.fn(), onForward: jest.fn(), onReaction: jest.fn(), onQuote: jest.fn(), onImage: jest.fn(), onFile: jest.fn(), onCloseTicket: jest.fn(), onRequestIt: jest.fn(), onError: jest.fn() };

test.each(['h', '123', 'Длинный текст, который занимает несколько строк и должен сразу оставить место для времени.'])('outgoing text is laid out with its timestamp before any measurement: %s', async text => {
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => { view = TestRenderer.create(React.createElement(HelpMessageBubble, { ...props, message: { ...message, text } })); });
  try {
    const node = (testID: string) => view.root.findAllByProps({ testID })[0];
    expect(node('help-message-text').props.onTextLayout).toBeUndefined();
    expect(node('help-text-layout').props.onLayout).toBeUndefined();
    expect(StyleSheet.flatten(node('help-message-stamp-reserve').props.style).opacity).toBe(0);
    expect(StyleSheet.flatten(node('help-message-text').props.style)).toMatchObject({fontSize:15,lineHeight:21,includeFontPadding:false});
    expect(StyleSheet.flatten(node('help-message-time').props.style)).toMatchObject({ position: 'absolute', right: 11, bottom: 5 });
    await act(async () => view.update(React.createElement(HelpMessageBubble, { ...props, message: { ...message, text }, readByOthers: true })));
    expect(StyleSheet.flatten(node('help-message-time').props.style)).toMatchObject({ position: 'absolute', right: 11, bottom: 5 });
  } finally { await act(async () => view.unmount()); }
});

test('pending, acknowledged and failed text share padding and metadata geometry', async () => {
  let view!: TestRenderer.ReactTestRenderer;
  const item: HelpPending = { key: 'first-paint', ticketId: 4, create: false, input: { text: '123' }, createdAt: Date.parse(message.createdAt), status: 'sending' };
  const retry = jest.fn();
  await act(async () => { view = TestRenderer.create(React.createElement(HelpPendingMessage, { item, onRetry: retry })); });
  try {
    const node = (testID: string) => view.root.findAllByProps({ testID })[0];
    const pending = StyleSheet.flatten(node('help-pending-bubble').props.style);
    const stamp = StyleSheet.flatten(node('help-message-time').props.style);
    const pendingText = view.root.findAllByProps({accessibilityLabel:item.input.text})[0];
    const textMetrics = StyleSheet.flatten(pendingText.props.style);
    expect(pending).toMatchObject({ minWidth: 90, paddingHorizontal: 11, paddingVertical: 6 });
    expect(node('help-message-stamp-reserve')).toBeDefined();
    expect(node('help-message-pending-clock').props.name).toBe('time-outline');
    expect(node('help-message-time').findAllByType(require('react-native').Text)).toHaveLength(1);
    expect(React.Children.toArray(node('help-message-time').props.children)[0]).toMatchObject({type:require('react-native').Text});
    expect(view.root.findAllByType(require('react-native').ActivityIndicator)).toHaveLength(0);
    await act(async () => view.update(React.createElement(HelpPendingMessage, { item: { ...item, status: 'failed' }, onRetry: retry })));
    expect(StyleSheet.flatten(node('help-message-time').props.style)).toEqual(stamp);
    await act(async () => view.root.findAllByProps({ accessibilityLabel: 'Не удалось отправить. Отправить снова' })[0].props.onPress());
    expect(retry).toHaveBeenCalledTimes(1);
    await act(async () => view.update(React.createElement(HelpMessageBubble, props)));
    expect(StyleSheet.flatten(node('help-message-content').props.style)).toMatchObject({ paddingHorizontal: pending.paddingHorizontal, paddingVertical: pending.paddingVertical });
    expect(StyleSheet.flatten(node('help-message-text').props.style)).toEqual(textMetrics);
    expect(StyleSheet.flatten(node('help-message-time').props.style)).toEqual(stamp);
  } finally { await act(async () => view.unmount()); }
});
