import React from 'react';
import { Image } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
const mockActions: Record<string, (value?: unknown) => unknown> = {};
jest.mock('../src/features/help/helpDiagnostics', () => ({ helpDevState: jest.fn(), helpDevActions: (_owner: string, actions: Record<string, (value?: unknown) => unknown>) => { Object.assign(mockActions, actions); return () => {}; } }));
jest.mock('../qa/help-preview/HelpPreview', () => {
  const owner = { id: 101, name: 'Вы', avatarUrl: null }, specialist = { id: 202, name: 'IT', avatarUrl: null };
  const message = (id: number, text: string, own = false, extra = {}) => ({ id, ticketId: 1042, sequence: id, text, authorId: own ? 101 : 202, author: own ? owner : specialist, authorRole: own ? 'USER' : 'IT', kind: 'TEXT', clientMessageId: null, createdAt: '2026-10-28T10:00:00.000Z', editedAt: null, replyToId: null, replyTo: null, forwardedFromId: null, rating: null, attachments: [], reactions: [], ...extra });
  return { OWNER: owner, IT: specialist, message, fixtures: Array.from({ length: 8 }, (_, index) => message(index + 1, 'Пример', index % 3 === 0)), resolve: jest.fn(async(attachment:any)=>({uri:attachment.url})) };
});
import { useHelpService } from '../qa/help-preview/serviceFixture';

describe('Help history QA fixture transitions', () => {
  let service: ReturnType<typeof useHelpService>, screen: TestRenderer.ReactTestRenderer;
  function Harness() { service = useHelpService(); return null; }
  beforeEach(async () => { jest.spyOn(Image,'resolveAssetSource').mockReturnValue({uri:'asset://qa-album.png',width:100,height:100,scale:1}); await act(async () => { screen = TestRenderer.create(React.createElement(Harness)); }); });
  afterEach(async () => { await act(async () => screen.unmount()); });
  const action = async (name: string, value?: unknown) => { await act(async () => { await mockActions[name](value); }); };

  test('default composer fixture stays small; history navigation restores a saved message offset', async () => {
    await act(async () => { await service.openTicket(1042); });
    expect(service.messages).toHaveLength(8);
    expect(service.navigationTarget?.kind).toBe('latest');
    await action('fixture.history', 600);
    expect(service.messages[0].sequence).toBe(541);
    await action('fixture.history.jump', 200);
    expect(service.messages).toHaveLength(60);
    await act(async () => { await service.saveViewport({ messageId: 200, sequence: 200, offset: -13, atLatest: false }, 1042); service.clearSelection(); });
    await act(async () => { await service.openTicket(1042); });
    expect(service.navigationTarget).toMatchObject({ kind: 'anchor', sequence: 200, offset: -13 });
  });

  test('old-ticket teardown writes its explicit anchor without contaminating another ticket', async () => {
    await action('fixture.history', 600);
    await act(async () => { await service.openTicket(1042); });
    await act(async () => { await service.openTicket(1041); await service.saveViewport({ messageId: 200, sequence: 200, offset: -18, atLatest: false }, 1042); });
    await act(async () => { await service.openTicket(1041); });
    expect(service.navigationTarget?.kind).toBe('latest');
    await act(async () => { await service.openTicket(1042); });
    expect(service.navigationTarget).toMatchObject({ kind: 'anchor', sequence: 200, offset: -18 });
  });

  test('a loaded date retains its exact window and does not select the message',async()=>{
    await act(async()=>{await service.openTicket(1042);});
    await action('fixture.history',600);
    const messages=service.messages;
    const date=messages.at(-1)!.createdAt;
    await act(async()=>{await service.jumpToDate(date);});
    expect(service.navigationTarget?.kind).toBe('date');
    expect(service.messages).toBe(messages);
    const localDay=new Date(date).toLocaleDateString();
    expect(service.navigationTarget?.messageId).toBe(messages.find(message=>new Date(message.createdAt).toLocaleDateString()===localDay)!.id);
  });

  test('a distant fixture date loads around its first message with date intent',async()=>{
    await act(async()=>{await service.openTicket(1042);});
    await action('fixture.history',600);
    const oldWindow=service.messages;
    await act(async()=>{await service.jumpToDate('2025-01-02');});
    expect(service.messages).not.toBe(oldWindow);
    expect(service.navigationTarget?.kind).toBe('date');
    const first=service.messages.find(message=>message.id===service.navigationTarget?.messageId)!;
    expect(new Date(first.createdAt).toLocaleDateString()).toBe(new Date(2025,0,2).toLocaleDateString());
  });

  test('incoming messages append at the tail without requesting navigation', async () => {
    await action('fixture.history', 600);
    await act(async () => { await service.openTicket(1042); });
    const key = service.navigationTarget?.key;
    await action('fixture.incoming', 3);
    expect(service.messages.at(-1)?.sequence).toBe(603);
    expect(service.navigationTarget?.key).toBe(key);
    expect(service.hasNewer).toBe(false);
    expect(service.selectedTicket?.unreadCount).toBe(3);
  });

  test('participant read receipts change metadata without moving the visible messages', async () => {
    await act(async () => { await service.openTicket(1042); });
    const key = service.navigationTarget?.key;
    await action('fixture.readByOther', 6);
    expect(service.selectedTicket?.members.find(member => member.userId === 202)?.lastReadSequence).toBe(6);
    expect(service.navigationTarget?.key).toBe(key);
    await action('fixture.readByOther', 3);
    expect(service.selectedTicket?.members.find(member => member.userId === 202)?.lastReadSequence).toBe(6);
  });

  test('offline incoming stays deferred and reconnect preserves a distant reading window', async () => {
    await action('fixture.history', 600);
    await act(async () => { await service.openTicket(1042); });
    await action('fixture.history.jump', 200);
    const ids = service.messages.map(message => message.id), key = service.navigationTarget?.key;
    await action('fixture.offline', true);
    await action('fixture.incoming', 3);
    expect(service.selectedTicket?.lastMessage?.sequence).toBe(600);
    await action('fixture.offline', false);
    expect(service.messages.map(message => message.id)).toEqual(ids);
    expect(service.navigationTarget?.key).toBe(key);
    expect(service.selectedTicket?.lastMessage?.sequence).toBe(603);
    expect(service.hasNewer).toBe(true);
  });
  test('album text and reserved dimensions arrive before delayed local media resolution', async () => {
    await act(async () => { await service.openTicket(1042); });
    const key=service.navigationTarget?.key;
    await action('fixture.mediaLatency',1200);await action('fixture.album',10);
    const album=service.messages.at(-1)!;
    expect(album.attachments).toHaveLength(10);expect(album.text).toContain('Текст виден сразу');
    expect(album.attachments.every(item=>item.width!>0&&item.height!>0&&item.thumbnailDataUri?.startsWith('data:image/png;base64,'))).toBe(true);
    expect(service.navigationTarget?.key).toBe(key);
    jest.useFakeTimers();
    try {
      let finished=false;const pending=service.mediaSource(album.attachments[0]).then(source=>{finished=true;return source;});
      expect(finished).toBe(false);await jest.advanceTimersByTimeAsync(1199);expect(finished).toBe(false);
      await jest.advanceTimersByTimeAsync(1);expect((await pending).uri).toBe('asset://qa-album.png');expect(finished).toBe(true);
    }finally{jest.useRealTimers();}
  });
  test('voice action creates unique message attachments and resolves the existing local QA tone only on demand', async () => {
    await act(async () => { await service.openTicket(1042); });
    const resolve=require('../qa/help-preview/HelpPreview').resolve as jest.Mock;resolve.mockClear();
    await action('fixture.voice');const first=service.messages.at(-1)!;
    await action('fixture.voice');const second=service.messages.at(-1)!;
    expect(first.attachments[0].kind).toBe('AUDIO');expect(first.attachments[0].id).not.toBe(second.attachments[0].id);
    expect(resolve).not.toHaveBeenCalled();
    await service.mediaSource(first.attachments[0]);expect(resolve).toHaveBeenCalledWith(expect.objectContaining({id:'qa-voice',mimeType:'audio/wav'}));
  });
});
