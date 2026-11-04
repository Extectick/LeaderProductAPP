import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Pressable } from 'react-native';
jest.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
import type { HelpMessage } from '../src/features/help/helpApi';
import { helpQuestions, restoreHelpQuestionDraft, formatHelpQuestionAnswers } from '../src/features/help/helpQuestions';
import { HelpQuestionPanel, type HelpQuestionPanelHandle } from '../src/features/help/components/HelpQuestionPanel';
import { HelpAssistantItAction } from '../src/features/help/components/HelpAssistantItAction';

const run = { runId: 'run', eventId: 1, ticketId: 24, status: 'completed' as const, step: 4, completedSteps: 4, startedAt: 1, updatedAt: 2 };
const questions = [{ id: 'os', header: 'Система', question: 'Какая ОС?', multiSelect: false,
  options: [{ label: 'Windows 10' }, { label: 'Windows 11' }] },
  { id: 'error', header: 'Ошибка', question: 'Какой текст ошибки?', multiSelect: false, options: [] }];

test('ticket 24 legacy questions never become clickable answers echoed back to the model', () => {
  const message = { text: 'Уточните следующие данные:', assistantRun: { ...run, generation: { decision: 'clarify' },
    suggestions: ['Укажите версию клиента 1С и версии информационной базы.', 'Укажите операционную систему.', 'Опишите точное сообщение об ошибке.'] } } as HelpMessage;
  const result = helpQuestions(message);
  expect(result).toHaveLength(3);
  expect(result.every(item => item.options.length === 0)).toBe(true);
  expect(result[2].question).toContain('ошибке');
  expect(helpQuestions({ ...message, assistantRun: { ...message.assistantRun!, status: 'streaming' } })).toEqual([]);
});

test('restores only real choices and preserves question/answer association', () => {
  const draft = restoreHelpQuestionDraft(JSON.stringify({ index: 1, answers: {
    os: { selected: ['Windows 11', 'fake-option'], text: '' }, error: { selected: [], text: 'Ошибка E502' },
  } }), questions);
  expect(draft.answers.os.selected).toEqual(['Windows 11']);
  expect(formatHelpQuestionAnswers(questions, draft)).toBe('Какая ОС?\nОтвет: Windows 11\n\nКакой текст ошибки?\nОтвет: Ошибка E502');
  expect(() => formatHelpQuestionAnswers(questions, { ...draft, answers: {} })).toThrow();
});

test('question wizard retains answers on back, waits for all answers and submits once', async () => {
  let view!: TestRenderer.ReactTestRenderer;
  const ref = React.createRef<HelpQuestionPanelHandle>(), submit = jest.fn().mockResolvedValue(true);
  const save = jest.fn().mockResolvedValue(undefined), change = jest.fn();
  const props = { ref, questions, draft: '', disabled: false, maxBodyHeight: 120,
    loadDraft: async () => '', saveDraft: save, onDraftChange: change,
    onWriteAnswer: jest.fn(), onSubmit: submit, onDismiss: jest.fn() };
  await act(async () => { view = TestRenderer.create(React.createElement(HelpQuestionPanel, props)); });
  const button = (label: string) => view.root.findAll(item => item.props.accessibilityLabel === label && typeof item.props.onPress === 'function')[0];
  try {
    await act(async () => button('Windows 11').props.onPress());
    expect(submit).not.toHaveBeenCalled();
    await act(async () => button('Следующий вопрос').props.onPress());
    expect(submit).not.toHaveBeenCalled();
    await act(async () => button('Предыдущий вопрос').props.onPress());
    expect(button('Windows 11').props.accessibilityState.checked).toBe(true);
    await act(async () => button('Следующий вопрос').props.onPress());
    let release!: (sent: boolean) => void;
    submit.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    let first!: Promise<boolean>, duplicate!: Promise<boolean>;
    await act(async () => { first = ref.current!.answer('Ошибка E502'); duplicate = ref.current!.answer('Ошибка E502'); await duplicate; });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith('Какая ОС?\nОтвет: Windows 11\n\nКакой текст ошибки?\nОтвет: Ошибка E502');
    await act(async () => { release(true); await first; });
    expect(save).toHaveBeenLastCalledWith('');
    expect(view.toJSON()).toBeNull();
  } finally { await act(async () => view.unmount()); }
});

test.each(['thinking', 'streaming', 'stopped', 'completed', 'error'] as const)('IT action is offered only when appropriate (%s)', async status => {
  let view!: TestRenderer.ReactTestRenderer;
  const request = jest.fn();
  await act(async () => { view = TestRenderer.create(React.createElement(HelpAssistantItAction, { run: { ...run, status, action: { type: 'request_it' } }, onRequestIt: request })); });
  try {
    const buttons = view.root.findAll(item => item.props.accessibilityLabel === 'Вызвать IT-специалиста' && typeof item.props.onPress === 'function');
    expect(buttons.length > 0).toBe(status === 'completed' || status === 'error');
    expect(request).not.toHaveBeenCalled();
    if (buttons.length) { await act(async () => buttons[0].props.onPress()); expect(request).toHaveBeenCalledTimes(1); }
  } finally { await act(async () => view.unmount()); }
});
