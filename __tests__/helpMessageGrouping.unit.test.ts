import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import type { HelpMessage } from '../src/features/help/helpApi';
import { helpMessageGroups, helpMessagesCanGroup, helpTimelineRows } from '../src/features/help/helpTimelineModel';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('../src/features/help/helpTheme', () => ({ useHelpReducedMotion: () => true, useHelpTheme: () => ({ surface: '#222222', text: '#ffffff', muted: '#999999', accent: '#3388ff', accentText: '#88bbff', outgoing: '#334455' }) }));
jest.mock('../src/features/help/components/HelpPrimitives', () => ({ HelpIcon: 'HelpIcon', HelpAvatar: 'HelpAvatar' }));
jest.mock('../src/features/help/components/HelpMedia', () => ({ HelpAudio: 'HelpAudio', HelpImage: 'HelpImage' }));
jest.mock('../src/features/help/components/HelpChatSearch', () => ({ HelpSearchText: 'HelpSearchText' }));
import { HelpMessageBubble } from '../src/features/help/components/HelpMessageBubble';

const message = (sequence: number, overrides: Partial<HelpMessage> = {}): HelpMessage => ({
  id: sequence, ticketId: 4, sequence, clientMessageId: null, authorId: 8,
  author: { id: 8, name: 'Анна', avatarUrl: null }, authorRole: 'IT', kind: 'TEXT', text: `Сообщение ${sequence}`,
  createdAt: `2026-10-28T12:0${sequence - 1}:00`, editedAt: null, replyToId: null, replyTo: null,
  forwardedFromId: null, rating: null, attachments: [], reactions: [], ...overrides,
});

describe('consecutive Help message groups', () => {
  test('six messages have one first and one last; page joins repair only the group edges', () => {
    const messages = Array.from({ length: 6 }, (_, index) => message(index + 1));
    const groups = helpMessageGroups(messages);
    expect([...groups.values()].filter(group => group.groupFirst)).toHaveLength(1);
    expect([...groups.values()].filter(group => group.groupLast)).toHaveLength(1);
    expect(groups.get(1)).toEqual({ groupFirst: true, groupLast: false });
    expect(groups.get(6)).toEqual({ groupFirst: false, groupLast: true });
    expect(helpMessageGroups(messages.slice(2, 4)).get(3)?.groupFirst).toBe(true);
    expect(groups.get(3)?.groupFirst).toBe(false);
    expect(helpMessageGroups(messages.slice(2, 4)).get(4)?.groupLast).toBe(true);
    expect(groups.get(4)?.groupLast).toBe(false);
    expect(helpTimelineRows(messages).filter(row => row.kind === 'message').map(row => row.key))
      .toEqual(messages.map(item => `message:${item.id}`));
  });

  test('an unread separator breaks a run before its first unread message', () => {
    const groups = helpMessageGroups([message(1), message(2), message(3)], 2);
    expect(groups.get(1)).toEqual({ groupFirst: true, groupLast: true });
    expect(groups.get(2)).toEqual({ groupFirst: true, groupLast: false });
    expect(groups.get(3)).toEqual({ groupFirst: false, groupLast: true });
    expect(helpTimelineRows([message(1), message(2)], 2).map(row => row.kind))
      .toEqual(['date', 'message', 'unread', 'message']);
  });

  test.each(['SYSTEM', 'CLOSURE'] as const)('%s isolates itself and separates surrounding messages', kind => {
    const groups = helpMessageGroups([message(1), message(2, { kind }), message(3)]);
    expect([...groups.values()]).toEqual(Array(3).fill({ groupFirst: true, groupLast: true }));
  });

  test('sender, ticket and local calendar date changes break groups', () => {
    expect(helpMessagesCanGroup(message(1), message(2, { authorId: 9 }))).toBe(false);
    expect(helpMessagesCanGroup(message(1), message(2, { ticketId: 5 }))).toBe(false);
    expect(helpMessagesCanGroup(message(1, { authorId: null }), message(2, { authorId: null }))).toBe(false);
    expect(helpMessagesCanGroup(message(1, { createdAt: '2026-10-28T23:59:00' }), message(2, { createdAt: '2026-10-29T00:00:00' }))).toBe(false);
  });

  test('five minutes is inclusive, while reversed or invalid timestamps cannot connect', () => {
    const first = message(1);
    expect(helpMessagesCanGroup(first, message(2, { createdAt: '2026-10-28T12:05:00' }))).toBe(true);
    expect(helpMessagesCanGroup(first, message(2, { createdAt: '2026-10-28T12:05:00.001' }))).toBe(false);
    expect(helpMessagesCanGroup(first, message(2, { createdAt: '2026-10-28T11:59:00' }))).toBe(false);
    expect(helpMessagesCanGroup(first, message(2, { createdAt: 'invalid' }))).toBe(false);
  });
});

describe('grouped message presentation', () => {
  let screen: TestRenderer.ReactTestRenderer | undefined;
  afterEach(async () => { if (screen) await act(async () => screen!.unmount()); screen = undefined; });
  const bubbles = () => screen!.root.findAllByType(HelpMessageBubble);
  const node = (bubble: TestRenderer.ReactTestInstance, id: string) => bubble.findAll(item => item.props.testID === id)[0];

  async function render(messages: HelpMessage[], firstUnreadSequence?: number, userId = 7) {
    const groups = helpMessageGroups(messages, firstUnreadSequence);
    const onMenu = messages.map(() => jest.fn());
    await act(async () => {
      screen = TestRenderer.create(React.createElement(React.Fragment, null, ...messages.map((item, index) => React.createElement(HelpMessageBubble, {
        key: item.id, message: item, userId, open: true, canInteract: true, selected: false, highlighted: true, solution: false,
        ...groups.get(item.id), resolve: jest.fn(), onMenu: onMenu[index], onDismissMenu: jest.fn(), onReply: jest.fn(), onCopy: jest.fn(),
        onEdit: jest.fn(), onForward: jest.fn(), onReaction: jest.fn(), onQuote: jest.fn(), onImage: jest.fn(), onFile: jest.fn(),
        onCloseTicket: jest.fn(), onRequestIt: jest.fn(), onError: jest.fn(),
      }))));
    });
    return onMenu;
  }

  test('six incoming messages show one sender and one bottom avatar, preserving every timestamp and action', async () => {
    const onMenu = await render(Array.from({ length: 6 }, (_, index) => message(index + 1)));
    const rendered = bubbles();
    expect(rendered.filter(bubble => node(bubble, 'help-message-author'))).toHaveLength(1);
    expect(screen!.root.findAllByType('HelpAvatar' as any)).toHaveLength(1);
    expect(rendered[5].findAllByType('HelpAvatar' as any)).toHaveLength(1);
    expect(StyleSheet.flatten(node(rendered[5], 'help-message-avatar-slot').props.style)).toMatchObject({ alignSelf: 'flex-end', width: 28 });
    rendered.forEach((bubble, index) => {
      expect(node(bubble, 'help-message-time')).toBeDefined();
      expect(node(bubble, 'help-message-avatar-slot')).toBeDefined();
      node(bubble, 'help-message-bubble').props.onLongPress();
      expect(onMenu[index]).toHaveBeenCalledTimes(1);
    });
    const first = StyleSheet.flatten(node(rendered[0], 'help-message-bubble').props.style);
    const middle = StyleSheet.flatten(node(rendered[2], 'help-message-bubble').props.style);
    const last = StyleSheet.flatten(node(rendered[5], 'help-message-bubble').props.style);
    expect(first).toMatchObject({ borderTopLeftRadius: 16, borderBottomLeftRadius: 4 });
    expect(middle).toMatchObject({ borderTopLeftRadius: 4, borderBottomLeftRadius: 4 });
    expect(last).toMatchObject({ borderTopLeftRadius: 4, borderBottomLeftRadius: 16 });
    expect(StyleSheet.flatten(node(rendered[2], 'help-message-outline').props.style)).toMatchObject({ borderTopLeftRadius: 4, borderBottomLeftRadius: 4 });
    expect(StyleSheet.flatten(node(rendered[2], 'help-message-3').props.style)).toMatchObject({ marginTop: 1, marginBottom: 1 });
  });

  test('outgoing groups mirror the connected corners and keep their own receipts', async () => {
    await render([message(1), message(2)], undefined, 8);
    const rendered = bubbles();
    expect(screen!.root.findAllByType('HelpAvatar' as any)).toHaveLength(0);
    expect(rendered.every(bubble => !node(bubble, 'help-message-author'))).toBe(true);
    expect(StyleSheet.flatten(node(rendered[0], 'help-message-bubble').props.style)).toMatchObject({ borderTopRightRadius: 16, borderBottomRightRadius: 4 });
    expect(StyleSheet.flatten(node(rendered[1], 'help-message-bubble').props.style)).toMatchObject({ borderTopRightRadius: 4, borderBottomRightRadius: 16 });
    expect(rendered.every(bubble => node(bubble, 'help-message-receipt'))).toBe(true);
  });
});
