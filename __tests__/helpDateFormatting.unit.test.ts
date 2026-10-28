import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { helpCreated, helpDate, helpDayKey, helpTime } from '../src/features/help/helpUiUtils';
import { helpTimelineRows } from '../src/features/help/helpTimelineModel';
import type { HelpMessage } from '../src/features/help/helpApi';

test('cached formatters preserve the previous local date and time output', () => {
  const now = new Date(2026, 9, 28, 12);
  for (const value of ['2026-01-09T01:05:00Z', '2025-12-31T23:59:00Z', '2026-06-01T23:45:00-04:00']) {
    const date = new Date(value);
    expect(helpTime(value)).toBe(date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    expect(helpCreated(value)).toBe(date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
    expect(helpDate(value, now)).toBe(date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) }));
  }
});
test('today, yesterday and year boundary use the local calendar; invalid values stay harmless', () => {
  const now = new Date(2026, 0, 1, 0, 5);
  expect(helpDate(new Date(2026, 0, 1, 0, 1).toISOString(), now)).toBe('Сегодня');
  expect(helpDate(new Date(2025, 11, 31, 23, 59).toISOString(), now)).toBe('Вчера');
  expect(helpDate(new Date(2025, 11, 30, 12).toISOString(), now)).toContain('2025');
  expect(helpDayKey('invalid')).toBe(''); expect(helpDate('invalid')).toBe('');
  expect(helpTime('invalid')).toBe('Invalid Date'); expect(helpCreated('invalid')).toBe('Invalid Date');
});
test('date row keys do not change when today becomes yesterday at midnight', () => {
  jest.useFakeTimers();
  try {
    const value = new Date(2026, 0, 1, 12).toISOString();
    const messages = [{ id: 1, sequence: 1, createdAt: value }] as HelpMessage[];
    jest.setSystemTime(new Date(2026, 0, 1, 23, 59)); const before = helpTimelineRows(messages);
    expect(helpDate(value)).toBe('Сегодня');
    jest.setSystemTime(new Date(2026, 0, 2, 0, 1)); const after = helpTimelineRows(messages);
    expect(helpDate(value)).toBe('Вчера');
    expect(after.map(row => row.key)).toEqual(before.map(row => row.key)); expect(after[0].key).toBe('date:2026-01-01');
  } finally { jest.useRealTimers(); }
});
test('formatting and 600-message grouping never construct Intl formatters per item', () => {
  const construct = jest.spyOn(Intl, 'DateTimeFormat');
  const localDate = jest.spyOn(Date.prototype, 'toLocaleDateString');
  const localTime = jest.spyOn(Date.prototype, 'toLocaleTimeString');
  const localCreated = jest.spyOn(Date.prototype, 'toLocaleString');
  const messages = Array.from({ length: 600 }, (_, i) => ({ id: i + 1, sequence: i + 1, createdAt: new Date(2025, 0, 1, 10, i).toISOString() } as HelpMessage));
  for (const message of messages) { helpDate(message.createdAt, new Date(2026, 9, 28)); helpTime(message.createdAt); helpCreated(message.createdAt); }
  expect(helpTimelineRows(messages).filter(row => row.kind === 'message')).toHaveLength(600);
  expect(construct).not.toHaveBeenCalled(); expect(localDate).not.toHaveBeenCalled(); expect(localTime).not.toHaveBeenCalled(); expect(localCreated).not.toHaveBeenCalled();
});
test('DST spring gap, autumn repeated hour and positive timezone midnight match local native formatting', () => {
  const source = readFileSync(path.join(__dirname, '../src/features/help/helpUiUtils.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const values = ['2026-03-08T06:30:00Z', '2026-03-08T07:30:00Z', '2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z', '2026-10-27T20:30:00Z'];
  const script = `${compiled}\nprocess.stdout.write(JSON.stringify(${JSON.stringify(values)}.map(value=>({key:exports.helpDayKey(value),time:exports.helpTime(value),legacy:new Date(value).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}))));`;
  const run = (timezone: string) => JSON.parse(execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' })) as { key: string; time: string; legacy: string }[];
  const ny = run('America/New_York'); expect(ny.every(row => row.time === row.legacy)).toBe(true);
  expect(ny.slice(0, 2).map(row => row.time)).toEqual(['01:30', '03:30']); expect(ny.slice(2, 4).map(row => row.time)).toEqual(['01:30', '01:30']);
  expect(ny[2].key).toBe(ny[3].key);
  const novo = run('Asia/Novosibirsk'); expect(novo.every(row => row.time === row.legacy)).toBe(true); expect(novo[4].key).toBe('2026-10-28');
});
