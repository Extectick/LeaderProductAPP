import { canEditHelpMessage, canReopenHelpTicket, helpColor, helpCreated, helpDate, helpDuration, helpInitials, helpReplyGesture, helpTimestampFits, stableHelpOrder } from '../src/features/help/helpUiUtils';

describe('Help messenger UI logic', () => {
  const now = Date.parse('2026-10-23T06:00:00Z');
  test('editing enforces owner and strict one-hour boundary including closure feedback', () => {
    const own = { authorId: 10, kind: 'TEXT', createdAt: new Date(now - 3599999).toISOString() };
    expect(canEditHelpMessage(own, 10, now)).toBe(true);
    expect(canEditHelpMessage({ ...own, kind: 'CLOSURE' }, 10, now)).toBe(true);
    expect(canEditHelpMessage(own, 11, now)).toBe(false);
    expect(canEditHelpMessage({ ...own, createdAt: new Date(now - 3600000).toISOString() }, 10, now)).toBe(false);
    expect(canEditHelpMessage({ ...own, createdAt: new Date(now + 1).toISOString() }, 10, now)).toBe(false);
    expect(canEditHelpMessage({ ...own, kind: 'SYSTEM' }, 10, now)).toBe(false);
  });
  test('reopen accepts exact 72 hours but not after; invalid/future dates never reopen', () => {
    const closed = { status: 'CLOSED', closedAt: new Date(now - 72 * 3600000).toISOString() };
    expect(canReopenHelpTicket(closed, now)).toBe(true);
    expect(canReopenHelpTicket(closed, now + 1)).toBe(false);
    expect(canReopenHelpTicket({ ...closed, status: 'OPEN' }, now)).toBe(false);
    expect(canReopenHelpTicket({ ...closed, closedAt: null }, now)).toBe(false);
    expect(canReopenHelpTicket({ ...closed, closedAt: 'bad' }, now)).toBe(false);
    expect(canReopenHelpTicket({ ...closed, closedAt: new Date(now + 1).toISOString() }, now)).toBe(false);
  });
  test('new list session sorts activity, while a visible session keeps positions', () => {
    const rows = [{ id: 1, updatedAt: '2026-10-22' }, { id: 2, updatedAt: '2026-10-23' }];
    expect(stableHelpOrder(rows, []).map(t => t.id)).toEqual([2, 1]);
    const updated = [{ ...rows[0], updatedAt: '2026-10-24' }, rows[1], { id: 3, updatedAt: '2026-10-25' }];
    expect(stableHelpOrder(updated, [2, 1]).map(t => t.id)).toEqual([2, 1, 3]);
    expect(stableHelpOrder(updated, []).map(t => t.id)).toEqual([3, 1, 2]);
    expect(rows.map(t => t.id)).toEqual([1, 2]);
  });
  test('equal activity has deterministic descending ID tie-break', () => {
    expect(stableHelpOrder([{id:1,updatedAt:'2026-10-23'},{id:3,updatedAt:'2026-10-23'}],[]).map(t=>t.id)).toEqual([3,1]);
  });
  test('rightward swipe only; initial left or vertical movement cancels whole gesture', () => {
    expect(helpReplyGesture(30, 2)).toEqual({blocked:false,capture:true});
    expect(helpReplyGesture(-30, 2)).toEqual({blocked:true,capture:false});
    expect(helpReplyGesture(5, 30)).toEqual({blocked:true,capture:false});
    expect(helpReplyGesture(80, 0, true)).toEqual({blocked:true,capture:false});
    expect(helpReplyGesture(5, 1).capture).toBe(false);
    expect(helpReplyGesture(60, 18)).toEqual({blocked:false,capture:true});
    expect(helpReplyGesture(-3, 1)).toEqual({blocked:false,capture:false});
  });
  test('timestamp uses measured trailing line and full metadata width', () => {
    expect(helpTimestampFits(240, 160, 65)).toBe(true);
    expect(helpTimestampFits(240, 190, 65)).toBe(false);
    expect(helpTimestampFits(240, 160, 110)).toBe(false); // edited + large system font
    expect(helpTimestampFits(240, null, 65)).toBe(false);
    expect(helpTimestampFits(0, 10, 65)).toBe(false);
  });
  test('dates use local calendar boundaries and Russian labels', () => {
    const current = new Date(2026,9,23,0,5);
    expect(helpDate(new Date(2026,9,23,0,1).toISOString(),current)).toBe('Сегодня');
    expect(helpDate(new Date(2026,9,22,23,59).toISOString(),current)).toBe('Вчера');
    expect(helpDate('invalid',current)).toBe('');
    expect(helpCreated(current.toISOString())).toContain('2026');
  });
  test('avatar identity and audio duration are stable', () => {
    expect(helpColor(10)).toBe(helpColor(10)); expect(helpColor(10)).not.toBe(helpColor(11));
    expect(helpInitials('Иван Петров')).toBe('ИП'); expect(helpInitials('')).toBe('');
    expect(helpInitials('Иван · Петров')).toBe('ИП');
    expect(helpDuration(0)).toBe('0:00'); expect(helpDuration(65.9)).toBe('1:05');
  });
});
