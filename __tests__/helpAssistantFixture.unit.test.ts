import { FixtureAssistant, fixtureAssistantTitle } from '../qa/help-preview/assistantFixture';
import type { HelpAssistantRun, HelpAssistantScenario } from '../src/features/help/helpAssistant';
import { helpAssistantAvatarColor, helpHasAssistantAvatar } from '../src/features/help/helpAssistant';

describe('isolated Help AI scenario', () => {
  let assistant: FixtureAssistant;
  beforeEach(() => { jest.useFakeTimers(); assistant = new FixtureAssistant(); });
  afterEach(() => { assistant.dispose(); jest.useRealTimers(); });
  function start(scenario: HelpAssistantScenario = 'answer', ticket = 1043) {
    const events: {run: HelpAssistantRun; text: string}[] = [];
    const id = assistant.start(ticket, 'Не печатает принтер', scenario, (run, text) => events.push({run, text}));
    return { events, id };
  }
  test('ordered events finish all steps then stream a complete answer', () => {
    const { events } = start();
    expect(events[0].run.status).toBe('thinking');
    jest.runAllTimers();
    expect(events.at(-1)?.run).toMatchObject({status:'completed',completedSteps:4});
    expect(events.at(-1)?.text).toContain('модель принтера');
    expect(events.some(event => event.run.status === 'streaming' && event.text.length > 0)).toBe(true);
    expect(events.map(event => event.run.eventId)).toEqual(events.map((_, index) => index + 1));
    for (let i=1;i<events.length;i++) expect(events[i].text.startsWith(events[i-1].text)).toBe(true);
  });
  test('stop during streaming preserves partial answer and prevents late completion', () => {
    const { events, id } = start();
    jest.advanceTimersByTime(4800);
    const partial = events.at(-1)!.text;
    expect(partial.length).toBeGreaterThan(0);
    assistant.stop(1043,id);
    const count=events.length; jest.runAllTimers();
    expect(events).toHaveLength(count);
    expect(events.at(-1)).toMatchObject({run:{status:'stopped'},text:partial});
  });
  test('replacement ignores stale stop and cancels old timer', () => {
    const old=start(); jest.advanceTimersByTime(1000);
    const replacement=start('question'); const oldCount=old.events.length;
    assistant.stop(1043,old.id); jest.runAllTimers();
    expect(old.events).toHaveLength(oldCount);
    expect(replacement.events.at(-1)).toMatchObject({run:{status:'completed'}});
    expect(replacement.events.at(-1)!.text).toContain('Уточните');
  });
  test('error is terminal and another attempt can complete', () => {
    const failed=start('error'); jest.runAllTimers();
    expect(failed.events.at(-1)).toMatchObject({run:{status:'error',completedSteps:1},text:''});
    const retry=start(); jest.runAllTimers();
    expect(retry.events.at(-1)?.run.status).toBe('completed');
  });
  test('tickets run independently and dispose cancels every outstanding timer', () => {
    const slow=start('slow',1043), normal=start('answer',1044);
    jest.advanceTimersByTime(4500);
    expect(slow.events.at(-1)!.run.completedSteps).toBe(1);
    expect(normal.events.at(-1)!.run.completedSteps).toBe(4);
    assistant.dispose(); const counts=[slow.events.length,normal.events.length]; jest.runAllTimers();
    expect([slow.events.length,normal.events.length]).toEqual(counts);
  });
});

test('new ticket titles are short and meaningful', () => {
  expect(fixtureAssistantTitle('У меня принтер не печатает уже час')).toBe('Не печатает принтер');
  expect(fixtureAssistantTitle('')).toBe('Вопрос по вложению');
  expect(fixtureAssistantTitle('Очень длинное обращение '.repeat(10)).length).toBeLessThanOrEqual(48);
  expect(fixtureAssistantTitle('  Что-то\n сломалось  ')).toBe('Что-то сломалось');
});

test('AI avatar colors are stable per ticket and differ between nearby tickets',()=>{
  expect(helpAssistantAvatarColor(1043)).toBe(helpAssistantAvatarColor(1043));
  expect(helpAssistantAvatarColor(1043)).not.toBe(helpAssistantAvatarColor(1044));
  expect(new Set(Array.from({length:6},(_,index)=>helpAssistantAvatarColor(1043+index))).size).toBe(6);
  expect(helpAssistantAvatarColor(Number.NaN)).toMatch(/^#[0-9A-F]{6}$/i);
});

test('AI represents an AI-enabled ticket until an IT member joins',()=>{
  expect(helpHasAssistantAvatar({aiEnabled:true,members:[]})).toBe(true);
  expect(helpHasAssistantAvatar({aiEnabled:true,members:[{role:'OWNER'}]})).toBe(true);
  expect(helpHasAssistantAvatar({aiEnabled:true,members:[{role:'IT'}]})).toBe(false);
  expect(helpHasAssistantAvatar({aiEnabled:false,members:[]})).toBe(false);
});
