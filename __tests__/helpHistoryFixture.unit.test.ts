import type { HelpMessage } from '../src/features/help/helpApi';
import { createFixtureHistory, fixtureHistoryPage, searchFixtureHistory } from '../qa/help-preview/historyFixture';

const owner = { id: 101, name: 'Вы', avatarUrl: null }, specialist = { id: 202, name: 'IT', avatarUrl: null };
const history = createFixtureHistory(1042, 600, {} as HelpMessage, owner, specialist);

describe('Deterministic Help history QA scenarios', () => {
  test('latest and cursor pages have no missing or duplicate boundary messages', () => {
    const latest = fixtureHistoryPage(history);
    expect(latest.messages.map(message => message.sequence)).toEqual(Array.from({ length: 60 }, (_, index) => 541 + index));
    expect(latest).toMatchObject({ hasOlder: true, hasNewer: false });
    const older = fixtureHistoryPage(history, { before: 541 });
    expect(older.messages[0].sequence).toBe(481);
    expect(older.messages.at(-1)!.sequence).toBe(540);
    const newer = fixtureHistoryPage(history, { after: 540 });
    expect(newer.messages).toEqual(latest.messages);
  });

  test('distant jumps load a bounded window around the target and expose both paging directions', () => {
    const middle = fixtureHistoryPage(history, { aroundMessageId: 200 });
    expect(middle.messages).toHaveLength(60);
    expect(middle.messages.some(message => message.id === 200)).toBe(true);
    expect(middle).toMatchObject({ hasOlder: true, hasNewer: true });
    expect(fixtureHistoryPage(history, { around: 1 })).toMatchObject({ hasOlder: false, hasNewer: true });
    expect(() => fixtureHistoryPage(history, { aroundMessageId: 9999 })).toThrow('Сообщение не найдено');
  });

  test('newest-first search pages preserve the total and do not repeat matches', () => {
    const first = searchFixtureHistory(history, 'запись');
    const second = searchFixtureHistory(history, 'запись', first.nextCursor!);
    expect(first).toMatchObject({ total: 600, nextCursor: 581 });
    expect(second).toMatchObject({ total: 600, nextCursor: 561 });
    expect(first.messages[0].sequence).toBe(600);
    expect(second.messages[0].sequence).toBe(580);
    expect(new Set([...first.messages, ...second.messages].map(message => message.id)).size).toBe(40);
  });

  test('the same seed recreates exact dates, text lengths and sparse search targets', () => {
    expect(createFixtureHistory(1042, 600, {} as HelpMessage, owner, specialist)).toEqual(history);
    expect(searchFixtureHistory(history, 'контроль обмена').messages.map(message => message.sequence)).toEqual([564, 517, 470, 423, 376, 329, 282, 235, 188, 141, 94, 47]);
  });
});
