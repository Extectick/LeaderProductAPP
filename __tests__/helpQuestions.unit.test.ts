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

test('a different file with the same name does not satisfy a removed file answer', () => {
  const draft = restoreHelpQuestionDraft(JSON.stringify({ answers: { os: { selected: [], text: '', fileCount: 1, fileNames: ['log.txt'], fileKeys: ['file://original'] } } }), questions);
  expect(() => formatHelpQuestionAnswers([questions[0]], draft, 1, ['log.txt'], ['file://replacement'])).toThrow('Ответьте');
  expect(formatHelpQuestionAnswers([questions[0]], draft, 1, ['log.txt'], ['file://original'])).toContain('См. вложение');
});

test('final send captures its revision before waiting for local writes', async () => {
  let view!: TestRenderer.ReactTestRenderer, release!: () => void;
  const ref = React.createRef<HelpQuestionPanelHandle>(), submit = jest.fn().mockResolvedValue(true), save = jest.fn().mockResolvedValue(undefined);
  const snapshot = { revision: 1, text: 'Windows 11' }, start = jest.fn(() => snapshot);
  const props = { ref, questions: [{ ...questions[0], options: [] }], draft: 'Windows 11', disabled: false, maxBodyHeight: 120,
    loadDraft: async () => '', saveDraft: save, onDraftChange: jest.fn(), onWriteAnswer: jest.fn(), onSubmit: submit, onSubmitStart: start, onDismiss: jest.fn() };
  await act(async () => { view = TestRenderer.create(React.createElement(HelpQuestionPanel, props)); });
  try {
    await act(async () => { await ref.current!.answer('Windows 11'); });
    save.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    await act(async () => view.root.findAll(node => node.props.accessibilityLabel === 'Отправить ответы' && typeof node.props.onPress === 'function')[0].props.onPress());
    expect(start).toHaveBeenCalledTimes(1); expect(submit).not.toHaveBeenCalled();
    await act(async () => view.update(React.createElement(HelpQuestionPanel, { ...props, draft: 'Windows 11 новая редакция' })));
    await act(async () => release());
    expect(submit).toHaveBeenCalledWith('Какая ОС?\nОтвет: Windows 11', snapshot);
  } finally { await act(async () => view.unmount()); }
});

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
    await act(async () => { await ref.current!.answer('Ошибка E502'); });
    await act(async () => { view.update(React.createElement(HelpQuestionPanel, { ...props, draft: 'Ошибка E502' })); });
    expect(submit).not.toHaveBeenCalled();
    expect(view.root.findAllByProps({ testID: 'help-question-review' }).length).toBeGreaterThan(0);
    let release!: (sent: boolean) => void;
    submit.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    await act(async () => { await ref.current!.answer('Ошибка E502'); });
    expect(submit).not.toHaveBeenCalled();
    await act(async () => { button('Отправить ответы').props.onPress(); button('Отправить ответы').props.onPress(); });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith('Какая ОС?\nОтвет: Windows 11\n\nКакой текст ошибки?\nОтвет: Ошибка E502');
    await act(async () => { release(true); });
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

test('single selection auto-advances after 200 ms; the final choice still waits for review and explicit submit', async () => {
  jest.useFakeTimers();
  const submit = jest.fn().mockResolvedValue(true);
  const radioQuestions = questions.map(q => ({ ...q, options: [{ label: 'Да' }, { label: 'Нет' }] }));
  let view!: TestRenderer.ReactTestRenderer;
  const props = { questions: radioQuestions, draft: '', disabled: false, maxBodyHeight: 120,
    loadDraft: async () => '', saveDraft: jest.fn().mockResolvedValue(undefined), onDraftChange: jest.fn(),
    onWriteAnswer: jest.fn(), onSubmit: submit, onDismiss: jest.fn() };
  const button = (label: string) => view.root.findAll(item => item.props.accessibilityLabel === label && typeof item.props.onPress === 'function')[0];
  try {
    await act(async () => { view = TestRenderer.create(React.createElement(HelpQuestionPanel, props)); });
    await act(async () => button('Да').props.onPress());
    await act(async () => { jest.advanceTimersByTime(199); });
    expect(button('Следующий вопрос')).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(button('Проверить ответы')).toBeTruthy();
    await act(async () => button('Нет').props.onPress());
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(submit).not.toHaveBeenCalled();
    expect(button('Проверить ответы')).toBeTruthy();
    await act(async () => button('Проверить ответы').props.onPress());
    expect(submit).not.toHaveBeenCalled();
    await act(async () => button('Отправить ответы').props.onPress());
    expect(submit).toHaveBeenCalledTimes(1);
  } finally { if (view) await act(async () => view.unmount()); jest.useRealTimers(); }
});

test('message mode never captures ordinary chat text into saved question answers', async () => {
  let view!: TestRenderer.ReactTestRenderer;
  const ref = React.createRef<HelpQuestionPanelHandle>(), submit = jest.fn(), changed = jest.fn(), modeChanged = jest.fn();
  const props = { ref, questions, inputMode: 'message' as const, draft: 'Отдельное сообщение коллеге', disabled: false, maxBodyHeight: 120,
    loadDraft: async () => JSON.stringify({ index: 0, answers: { os: { selected: [], text: 'Мой ответ' } } }),
    saveDraft: jest.fn().mockResolvedValue(undefined), onDraftChange: changed, onInputModeChange: modeChanged,
    onWriteAnswer: jest.fn(), onSubmit: submit, onDismiss: jest.fn() };
  try {
    await act(async () => { view = TestRenderer.create(React.createElement(HelpQuestionPanel, props)); });
    await act(async () => { ref.current!.capture(props.draft); await ref.current!.answer(props.draft); });
    expect(ref.current!.getDraftText()).toBe('Мой ответ');
    expect(changed).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    const expand = view.root.findAll(item => item.props.accessibilityLabel === 'Развернуть вопросы ИИ' && typeof item.props.onPress === 'function')[0];
    await act(async () => expand.props.onPress());
    expect(modeChanged).toHaveBeenCalledWith('question');
    expect(ref.current!.getDraftText()).toBe('Мой ответ');
  } finally { await act(async () => view.unmount()); }
});

test('an attachment override answers only the explicit current question and is revalidated after removal', async () => {
  let view!: TestRenderer.ReactTestRenderer;
  const ref = React.createRef<HelpQuestionPanelHandle>(), submit = jest.fn().mockResolvedValue(true);
  const props = { ref, questions, draft: '', attachmentCount: 0, disabled: false, maxBodyHeight: 120,
    loadDraft: async () => '', saveDraft: jest.fn().mockResolvedValue(undefined), onDraftChange: jest.fn(),
    onWriteAnswer: jest.fn(), onSubmit: submit, onDismiss: jest.fn() };
  const button = (label: string) => view.root.findAll(item => item.props.accessibilityLabel === label && typeof item.props.onPress === 'function')[0];
  try {
    await act(async () => { view = TestRenderer.create(React.createElement(HelpQuestionPanel, props)); });
    await act(async () => { await ref.current!.answer('', { count: 1, names: ['error.txt'] }); });
    await act(async () => view.update(React.createElement(HelpQuestionPanel, { ...props, attachmentCount: 1 })));
    expect(button('Проверить ответы')).toBeTruthy();
    await act(async () => { await ref.current!.answer(''); });
    expect(submit).not.toHaveBeenCalled();
    await act(async () => button('Отправить ответы').props.onPress());
    expect(submit).toHaveBeenCalledWith('Какая ОС?\nОтвет: См. вложение\n\nКакой текст ошибки?\nОтвет: См. вложение');
  } finally { await act(async () => view.unmount()); }
});

test('review restores old drafts and keeps an unanswered sibling empty when a file is attached elsewhere', () => {
  const old = restoreHelpQuestionDraft(JSON.stringify({ index: 1, answers: { os: { selected: ['Windows 11'], text: '' } } }), questions);
  expect(old.review).toBe(false);
  expect(() => formatHelpQuestionAnswers(questions, old, 1)).toThrow();
  const saved = restoreHelpQuestionDraft(JSON.stringify({ ...old, review: true, answers: { ...old.answers,
    error: { selected: [], text: '', fileCount: 1, fileNames: ['error.txt'] } } }), questions);
  expect(saved.review).toBe(true);
  expect(saved.answers.error.fileNames).toEqual(['error.txt']);
  expect(formatHelpQuestionAnswers(questions, saved, 1)).toContain('Ответ: См. вложение');
  expect(() => formatHelpQuestionAnswers(questions, saved, 0)).toThrow();
});

test('multi-select waits for explicit advance and review edits retain other answers through failed sends', async () => {
  jest.useFakeTimers();
  let view!: TestRenderer.ReactTestRenderer, changeDraft!: (value: string) => void;
  const submit = jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  const panelQuestions = [{ ...questions[0], multiSelect: true }, questions[1]];
  function Harness() {
    const [draft, setDraft] = React.useState(''); changeDraft = setDraft;
    return React.createElement(HelpQuestionPanel, { questions: panelQuestions, draft, disabled: false, maxBodyHeight: 120,
      loadDraft: async () => '', saveDraft: async () => {}, onDraftChange: setDraft,
      onWriteAnswer: () => {}, onSubmit: submit, onDismiss: () => {} });
  }
  const button = (label: string) => view.root.findAll(item => item.props.accessibilityLabel === label && typeof item.props.onPress === 'function')[0];
  try {
    await act(async () => { view = TestRenderer.create(React.createElement(Harness)); });
    await act(async () => { button('Windows 10').props.onPress(); button('Windows 11').props.onPress(); });
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(button('Следующий вопрос')).toBeTruthy();
    await act(async () => button('Следующий вопрос').props.onPress());
    await act(async () => changeDraft('Ошибка E502'));
    await act(async () => button('Проверить ответы').props.onPress());
    expect(submit).not.toHaveBeenCalled();
    await act(async () => button('Изменить ответ 1').props.onPress());
    expect(button('Windows 10').props.accessibilityState.checked).toBe(true);
    expect(button('Windows 11').props.accessibilityState.checked).toBe(true);
    await act(async () => button('Windows 10').props.onPress());
    await act(async () => button('Следующий вопрос').props.onPress());
    await act(async () => button('Проверить ответы').props.onPress());
    await act(async () => button('Отправить ответы').props.onPress());
    expect(view.toJSON()).not.toBeNull();
    expect(submit).toHaveBeenLastCalledWith('Какая ОС?\nОтвет: Windows 11\n\nКакой текст ошибки?\nОтвет: Ошибка E502');
    await act(async () => button('Отправить ответы').props.onPress());
    expect(submit).toHaveBeenCalledTimes(2);
    expect(view.toJSON()).toBeNull();
  } finally { if (view) await act(async () => view.unmount()); jest.useRealTimers(); }
});

test('review restores its active question, capture keeps review, and stale send cannot submit in message mode', async () => {
  let view!: TestRenderer.ReactTestRenderer;
  const ref = React.createRef<HelpQuestionPanelHandle>(), changed = jest.fn(), submit = jest.fn(), save = jest.fn().mockResolvedValue(undefined);
  const saved = { index: 1, review: true, answers: { os: { selected: ['Windows 11'], text: '' }, error: { selected: [], text: 'E502' } } };
  const props = { ref, questions, draft: 'E502', inputMode: 'question' as const, disabled: false, maxBodyHeight: 120,
    loadDraft: async () => JSON.stringify(saved), saveDraft: save, onDraftChange: jest.fn(), onQuestionChange: changed,
    onWriteAnswer: jest.fn(), onSubmit: submit, onDismiss: jest.fn() };
  try {
    await act(async () => { view = TestRenderer.create(React.createElement(HelpQuestionPanel, props)); });
    expect(changed).toHaveBeenLastCalledWith({ index: 1, question: questions[1], review: true });
    await act(async () => ref.current!.capture('E503'));
    expect(JSON.parse(save.mock.calls.at(-1)[0]).review).toBe(true);
    const staleSend = view.root.findAll(item => item.props.accessibilityLabel === 'Отправить ответы' && typeof item.props.onPress === 'function')[0].props.onPress;
    await act(async () => view.update(React.createElement(HelpQuestionPanel, { ...props, inputMode: 'message', draft: 'Сообщение в чат' })));
    await act(async () => staleSend());
    expect(submit).not.toHaveBeenCalled();
    expect(ref.current!.getDraftText()).toBe('E503');
  } finally { await act(async () => view.unmount()); }
});
