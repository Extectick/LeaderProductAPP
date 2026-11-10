import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TextInput, StyleSheet } from 'react-native';
jest.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('../src/features/help/components/HelpQuestionReveal',()=>({HelpQuestionReveal:({collapsed,children,collapsedContent}:any)=>collapsed?collapsedContent:children}));
jest.mock('../src/features/help/components/HelpQuestionTransition',()=>({HelpQuestionTransition:({children,...props}:any)=>require('react').createElement('QuestionTransition',props,children)}));
import type { HelpMessage } from '../src/features/help/helpApi';
import { helpQuestions, restoreHelpQuestionDraft, formatHelpQuestionAnswers, skipHelpQuestion } from '../src/features/help/helpQuestions';
import { HelpQuestionPanel, HelpQuestionNavigation, type HelpQuestionPanelHandle } from '../src/features/help/components/HelpQuestionPanel';
import { HelpAssistantItAction } from '../src/features/help/components/HelpAssistantItAction';

const run = { runId: 'run', eventId: 1, ticketId: 24, status: 'completed' as const, step: 4, completedSteps: 4, startedAt: 1, updatedAt: 2 };
const questions = [{ id: 'os', header: 'Система', question: 'Какая ОС?', multiSelect: false,
  options: [{ label: 'Windows 10' }, { label: 'Windows 11' }] },
  { id: 'error', header: 'Ошибка', question: 'Какой текст ошибки?', multiSelect: false, options: [] }];

test('overflow has a visible cue until the last answer is fully scrolled into view',async()=>{
  let view!:TestRenderer.ReactTestRenderer;
  const props={integrated:true,questions,draft:'',disabled:false,maxBodyHeight:120,loadDraft:async()=>'',saveDraft:async()=>{},onDraftChange:jest.fn(),onWriteAnswer:jest.fn(),onSubmit:jest.fn()};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpQuestionPanel,props));});
  try{
    const body=view.root.findByProps({testID:'help-question-body'});
    await act(async()=>{body.props.onLayout({nativeEvent:{layout:{height:120}}});body.props.onContentSizeChange(360,250);});
    expect(view.root.findAllByProps({testID:'help-question-more-options'})).not.toHaveLength(0);
    await act(async()=>body.props.onScroll({nativeEvent:{layoutMeasurement:{height:120},contentSize:{height:250},contentOffset:{y:130}}}));
    expect(view.root.findAllByProps({testID:'help-question-more-options'})).toHaveLength(0);
    await act(async()=>body.props.onLayout({nativeEvent:{layout:{height:260}}}));
    expect(view.root.findAllByProps({testID:'help-question-more-options'})).toHaveLength(0);
  }finally{await act(async()=>view.unmount());}
});

test('Skip hides after a choice, and even a queued stale Skip preserves single and multiple answers',async()=>{
  let view!:TestRenderer.ReactTestRenderer;
  const ref=React.createRef<HelpQuestionPanelHandle>(),submit=jest.fn().mockResolvedValue(true);
  const qs=[questions[0],{...questions[1],multiSelect:true,options:[{label:'Вход проверен'},{label:'Сеть проверена'}]},
    {id:'comment',header:'Комментарий',question:'Что добавить?',multiSelect:false,options:[]}];
  const props={ref,integrated:true,submitOnLastAnswer:true,questions:qs,draft:'',disabled:false,maxBodyHeight:200,loadDraft:async()=>'',saveDraft:async()=>{},onDraftChange:jest.fn(),onWriteAnswer:jest.fn(),onSubmit:submit};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpQuestionPanel,props));});
  const buttons=(label:string)=>view.root.findAll(node=>node.props.accessibilityLabel===label&&typeof node.props.onPress==='function');
  try{
    const oldSkip=buttons('Пропустить вопрос')[0].props.onPress;
    await act(async()=>buttons('Windows 11')[0].props.onPress());
    expect(buttons('Пропустить вопрос')).toHaveLength(0);
    await act(async()=>oldSkip());
    const secondSkip=buttons('Пропустить вопрос')[0].props.onPress;
    await act(async()=>buttons('Вход проверен')[0].props.onPress());
    await act(async()=>buttons('Сеть проверена')[0].props.onPress());
    expect(buttons('Пропустить вопрос')).toHaveLength(0);
    await act(async()=>secondSkip());
    expect(submit).not.toHaveBeenCalled();
    await act(async()=>buttons('Пропустить вопрос')[0].props.onPress());
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0]).toBe('Какая ОС?\nОтвет: Windows 11\n\nКакой текст ошибки?\nОтвет: Вход проверен; Сеть проверена\n\nЧто добавить?\nВопрос пропущен пользователем.');
  }finally{await act(async()=>view.unmount());}
});

test('a stale skipped flag never hides a real selected or typed response',()=>{
  const draft=restoreHelpQuestionDraft(JSON.stringify({answers:{os:{selected:['Windows 11'],text:'',skipped:true},error:{selected:[],text:'E502',skipped:true}}}),questions);
  expect(formatHelpQuestionAnswers(questions,draft)).toBe('Какая ОС?\nОтвет: Windows 11\n\nКакой текст ошибки?\nОтвет: E502');
});

test('typing hides Skip and a queued old Skip cannot discard that text',async()=>{
  let view!:TestRenderer.ReactTestRenderer;
  const submit=jest.fn().mockResolvedValue(true);
  const props={integrated:true,submitOnLastAnswer:true,questions:[{...questions[0],options:[]}],draft:'',disabled:false,maxBodyHeight:200,loadDraft:async()=>'',saveDraft:async()=>{},onDraftChange:jest.fn(),onWriteAnswer:jest.fn(),onSubmit:submit};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpQuestionPanel,props));});
  const skip=()=>view.root.findAll(node=>node.props.accessibilityLabel==='Пропустить вопрос'&&typeof node.props.onPress==='function');
  try{
    const oldSkip=skip()[0].props.onPress;
    await act(async()=>view.update(React.createElement(HelpQuestionPanel,{...props,draft:'Мой текст'})));
    expect(skip()).toHaveLength(0);
    await act(async()=>oldSkip());
    expect(submit).toHaveBeenCalledWith('Какая ОС?\nОтвет: Мой текст');
  }finally{await act(async()=>view.unmount());}
});

test.each(['answer','skip'])('last %s sends once without a review step and preserves earlier answers',async action=>{
  let view!:TestRenderer.ReactTestRenderer;
  const ref=React.createRef<HelpQuestionPanelHandle>(),submit=jest.fn().mockResolvedValue(true),start=jest.fn(()=>({revision:7,text:''}));
  const qs=[...questions,{id:'extra',header:'Ещё',question:'Дополнение?',multiSelect:false,options:[]}];
  const props={ref,integrated:true,submitOnLastAnswer:true,questions:qs,draft:'',disabled:false,maxBodyHeight:200,loadDraft:async()=>'',saveDraft:async()=>{},onDraftChange:jest.fn(),onWriteAnswer:jest.fn(),onSubmit:submit,onSubmitStart:start};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpQuestionPanel,props));});
  try{
    await act(async()=>view.root.findAll(node=>node.props.accessibilityLabel==='Windows 11'&&typeof node.props.onPress==='function')[0].props.onPress());
    await act(async()=>{await ref.current!.answer('');await ref.current!.answer('Ошибка E502');});
    expect(submit).not.toHaveBeenCalled();
    expect(view.root.findAllByProps({testID:'help-question-review'})).toHaveLength(0);
    await act(async()=>{if(action==='skip'){ref.current!.skip();ref.current!.skip();}else{void ref.current!.answer('Тест');void ref.current!.answer('Тест');}});
    expect(submit).toHaveBeenCalledTimes(1);expect(start).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0]).toBe(`Какая ОС?\nОтвет: Windows 11\n\nКакой текст ошибки?\nОтвет: Ошибка E502\n\nДополнение?\n${action==='skip'?'Вопрос пропущен пользователем.':'Ответ: Тест'}`);
    expect(view.toJSON()).toBeNull();
  }finally{await act(async()=>view.unmount());}
});

test('old review drafts restore to the last question without automatically sending',async()=>{
  let view!:TestRenderer.ReactTestRenderer;
  const submit=jest.fn();
  const props={integrated:true,submitOnLastAnswer:true,questions,draft:'',disabled:false,maxBodyHeight:200,loadDraft:async()=>JSON.stringify({index:1,review:true,answers:{os:{selected:['Windows 11'],text:''},error:{selected:[],text:'E502'}}}),saveDraft:async()=>{},onDraftChange:jest.fn(),onWriteAnswer:jest.fn(),onSubmit:submit};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpQuestionPanel,props));});
  try{
    expect(view.root.findAllByProps({testID:'help-question-review'})).toHaveLength(0);
    expect(JSON.stringify(view.toJSON())).toContain('2 из 2');
    expect(submit).not.toHaveBeenCalled();
  }finally{await act(async()=>view.unmount());}
});

test('answering two questions and skipping the third preserves both answers and sends only from review',async()=>{
  let view!:TestRenderer.ReactTestRenderer;
  const qs=[...questions,{id:'extra',header:'Ещё',question:'Дополнительные сведения?',multiSelect:false,options:[]}];
  const ref=React.createRef<HelpQuestionPanelHandle>(),save=jest.fn().mockResolvedValue(undefined),submit=jest.fn().mockResolvedValue(true);
  const props={ref,integrated:true,questions:qs,draft:'',disabled:false,maxBodyHeight:200,loadDraft:async()=>'',saveDraft:save,onDraftChange:jest.fn(),onWriteAnswer:jest.fn(),onSubmit:submit};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpQuestionPanel,props));});
  try{
    await act(async()=>view.root.findAll(node=>node.props.accessibilityLabel==='Windows 11'&&typeof node.props.onPress==='function')[0].props.onPress());
    await act(async()=>{await ref.current!.answer('');});
    await act(async()=>{await ref.current!.answer('Ошибка E502');});
    await act(async()=>ref.current!.skip());
    const saved=JSON.parse(save.mock.calls.at(-1)[0]);
    expect(saved).toMatchObject({index:2,review:true,answers:{os:{selected:['Windows 11']},error:{text:'Ошибка E502'},extra:{skipped:true}}});
    expect(submit).not.toHaveBeenCalled();
    expect(JSON.stringify(view.toJSON())).toContain('Пропущен');
    const button=(label:string)=>view.root.findAll(node=>node.props.accessibilityLabel===label&&typeof node.props.onPress==='function')[0];
    await act(async()=>button('Свернуть вопросы ИИ').props.onPress());
    expect(JSON.parse(save.mock.calls.at(-1)[0])).toMatchObject({review:true,collapsed:true,answers:{extra:{skipped:true}}});
    await act(async()=>button('Развернуть вопросы ИИ').props.onPress());
    expect(JSON.stringify(view.toJSON())).toContain('Пропущен');
    await act(async()=>ref.current!.submitReview());
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith('Какая ОС?\nОтвет: Windows 11\n\nКакой текст ошибки?\nОтвет: Ошибка E502\n\nДополнительные сведения?\nВопрос пропущен пользователем.');
  }finally{await act(async()=>view.unmount());}
});

test('legacy whole-panel dismissal recovers partial answers into review and persists the per-question skip',()=>{
  const raw=JSON.stringify({index:1,dismissed:true,answers:{os:{selected:['Windows 11'],text:''}}});
  const restored=restoreHelpQuestionDraft(raw,questions);
  expect(restored).toMatchObject({review:true,answers:{os:{selected:['Windows 11']},error:{skipped:true}}});
  expect(restoreHelpQuestionDraft(JSON.stringify(restored),questions)).toEqual(restored);
  expect(formatHelpQuestionAnswers(questions,restored)).toBe('Какая ОС?\nОтвет: Windows 11\n\nКакой текст ошибки?\nВопрос пропущен пользователем.');
});

test('skip advances only the current step; editing a skipped answer replaces the skip',async()=>{
  let view!:TestRenderer.ReactTestRenderer;
  const ref=React.createRef<HelpQuestionPanelHandle>(),save=jest.fn().mockResolvedValue(undefined);
  const props={ref,integrated:true,questions,draft:'',disabled:false,maxBodyHeight:200,loadDraft:async()=>'',saveDraft:save,onDraftChange:jest.fn(),onWriteAnswer:jest.fn(),onSubmit:jest.fn()};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpQuestionPanel,props));});
  try{
    await act(async()=>{ref.current!.skip();ref.current!.skip();});
    expect(JSON.parse(save.mock.calls.at(-1)[0])).toMatchObject({index:1,review:false,answers:{os:{skipped:true}}});
    await act(async()=>ref.current!.back());
    await act(async()=>view.root.findAll(node=>node.props.accessibilityLabel==='Windows 11'&&typeof node.props.onPress==='function')[0].props.onPress());
    expect(JSON.parse(save.mock.calls.at(-1)[0]).answers.os).toMatchObject({selected:['Windows 11'],skipped:false});
    const draft=restoreHelpQuestionDraft(JSON.stringify({index:1,answers:{os:{selected:['Windows 11'],text:''}}}),questions);
    expect(skipHelpQuestion(draft,questions).answers.os.selected).toEqual(['Windows 11']);
  }finally{await act(async()=>view.unmount());}
});

test('restoration reveals only the saved question, without flashing the first step',async()=>{
  let view!:TestRenderer.ReactTestRenderer,restore!:(value:string)=>void;
  const ref=React.createRef<HelpQuestionPanelHandle>();
  const props={ref,integrated:true,questions,draft:'',disabled:false,maxBodyHeight:160,
    loadDraft:()=>new Promise<string>(resolve=>{restore=resolve;}),saveDraft:async()=>{},onDraftChange:jest.fn(),onWriteAnswer:jest.fn(),onSubmit:jest.fn(),onDismiss:jest.fn()};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpQuestionPanel,props));});
  try{
    expect(view.toJSON()).toBeNull();
    await act(async()=>restore(JSON.stringify({index:1,answers:{os:{selected:['Windows 11'],text:''}}})));
    expect(JSON.stringify(view.toJSON())).toContain('2 из 2');
    expect(JSON.stringify(view.toJSON())).not.toContain('Какая ОС?');
  }finally{await act(async()=>view.unmount());}
});

test('integrated questions use composer action, preserve typed text when selecting, and navigate without sending', async () => {
  let view!: TestRenderer.ReactTestRenderer;
  const ref=React.createRef<HelpQuestionPanelHandle>(),save=jest.fn().mockResolvedValue(undefined),submit=jest.fn(),change=jest.fn();
  const props={ref,integrated:true,questions,draft:'Мой текст',disabled:false,maxBodyHeight:160,
    loadDraft:async()=>'',saveDraft:save,onDraftChange:change,onWriteAnswer:jest.fn(),onSubmit:submit,onDismiss:jest.fn()};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpQuestionPanel,props));});
  try {
    expect(view.root.findAllByType(TextInput)).toHaveLength(0);
    expect(view.root.findAllByProps({testID:'help-question-footer'})).toHaveLength(0);
    expect(view.root.findAllByProps({accessibilityLabel:'Написать свой ответ'})).toHaveLength(0);
    await act(async()=>view.root.findAll(node=>node.props.accessibilityLabel==='Windows 11'&&typeof node.props.onPress==='function')[0].props.onPress());
    expect(change).not.toHaveBeenCalled();
    expect(JSON.parse(save.mock.calls.at(-1)[0]).answers.os).toMatchObject({selected:['Windows 11'],text:'Мой текст'});
    await act(async()=>{await ref.current!.answer('Мой текст');});
    await act(async()=>ref.current!.back());
    expect(ref.current!.getDraftText()).toBe('Мой текст');
    expect(submit).not.toHaveBeenCalled();
  }finally{await act(async()=>view.unmount());}
});

test('small navigation hides Back on first question and exposes it on later steps and review', async()=>{
  let view!:TestRenderer.ReactTestRenderer;
  const props={index:0,review:false,disabled:false,onBack:jest.fn(),onSkip:jest.fn()};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpQuestionNavigation,props));});
  const labels=()=>view.root.findAll(node=>typeof node.props.onPress==='function').map(node=>node.props.accessibilityLabel);
  try{
    expect(labels()).not.toContain('Предыдущий вопрос');expect(labels()).toContain('Пропустить вопрос');
    await act(async()=>view.update(React.createElement(HelpQuestionNavigation,{...props,index:1})));
    expect(labels()).toContain('Предыдущий вопрос');
    await act(async()=>view.update(React.createElement(HelpQuestionNavigation,{...props,review:true})));
    expect(labels()).toContain('Вернуться к вопросам');
  }finally{await act(async()=>view.unmount());}
});

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
    await act(async () => button('Далее').props.onPress());
    expect(submit).not.toHaveBeenCalled();
    await act(async () => button('Предыдущий вопрос').props.onPress());
    expect(button('Windows 11').props.accessibilityState.checked).toBe(true);
    await act(async () => button('Далее').props.onPress());
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

test('single selection stays on the current question until explicit advance; final review sends once', async () => {
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
    expect(JSON.stringify(view.toJSON())).toContain('1 из 2');
    await act(async () => button('Да').props.onPress());
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(JSON.stringify(view.toJSON())).toContain('1 из 2');
    expect(button('Да').props.accessibilityState.checked).toBe(true);
    await act(async () => button('Нет').props.onPress());
    expect(button('Нет').props.accessibilityState.checked).toBe(true);
    expect(button('Да').props.accessibilityState.checked).toBe(false);
    expect(submit).not.toHaveBeenCalled();
    await act(async () => button('Далее').props.onPress());
    expect(JSON.stringify(view.toJSON())).toContain('2 из 2');
    await act(async () => button('Да').props.onPress());
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(submit).not.toHaveBeenCalled();
    expect(button('Проверить ответы')).toBeTruthy();
    await act(async () => button('Проверить ответы').props.onPress());
    expect(submit).not.toHaveBeenCalled();
    expect(button('Вернуться к вопросам')).toBeTruthy();
    await act(async () => button('Отправить ответы').props.onPress());
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith('Какая ОС?\nОтвет: Нет\n\nКакой текст ошибки?\nОтвет: Да');
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
    expect(button('Далее')).toBeTruthy();
    await act(async () => button('Далее').props.onPress());
    await act(async () => changeDraft('Ошибка E502'));
    await act(async () => button('Проверить ответы').props.onPress());
    expect(submit).not.toHaveBeenCalled();
    await act(async () => button('Изменить ответ 1').props.onPress());
    expect(button('Windows 10').props.accessibilityState.checked).toBe(true);
    expect(button('Windows 11').props.accessibilityState.checked).toBe(true);
    await act(async () => button('Windows 10').props.onPress());
    await act(async () => button('Далее').props.onPress());
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


test('compact panel delegates typing and attachments to the existing composer and offers one next action', async () => {
  let view!: TestRenderer.ReactTestRenderer;
  const write = jest.fn(), attach = jest.fn();
  const props = { questions, draft: '', disabled: false, maxBodyHeight: 200,
    loadDraft: async () => '', saveDraft: jest.fn().mockResolvedValue(undefined), onDraftChange: jest.fn(),
    onWriteAnswer: write, onAttachFiles: attach, onSubmit: jest.fn(), onDismiss: jest.fn(), onInputModeChange: jest.fn() };
  try {
    await act(async () => { view = TestRenderer.create(React.createElement(HelpQuestionPanel, props)); });
    expect(view.root.findAllByType(TextInput)).toHaveLength(0);
    expect(view.root.findAll(node => node.props.accessibilityRole === 'tab')).toHaveLength(0);
    expect(view.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && /Перейти к вопросу|Прикрепить файл к ответу|Все вопросы и ответы/.test(node.props.accessibilityLabel))).toHaveLength(0);
    const footer = view.root.findByProps({ testID: 'help-question-footer' });
    const actions = [...new Map(footer.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityRole === 'button').map(node => [node.props.accessibilityLabel, node])).values()];
    expect(actions.map(node => node.props.accessibilityLabel)).toEqual(['Далее']);
    const serialized=JSON.stringify(view.toJSON());
    expect(serialized.indexOf('help-question-navigation')).toBeLessThan(serialized.indexOf('help-question-body'));
    expect(view.root.findByType('QuestionTransition' as any).props.index).toBe(0);
    expect(actions.every(node => StyleSheet.flatten(node.props.style).minHeight >= 44)).toBe(true);
    const custom = view.root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === 'Написать свой ответ')[0];
    await act(async () => custom.props.onPress());
    expect(write).toHaveBeenCalledTimes(1);
    expect(attach).not.toHaveBeenCalled();
  } finally { await act(async () => view.unmount()); }
});

test('collapse and reopen preserve the current answer while message mode keeps ordinary text separate', async () => {
  let view!: TestRenderer.ReactTestRenderer;
  const ref = React.createRef<HelpQuestionPanelHandle>(), save = jest.fn().mockResolvedValue(undefined), modeChanged = jest.fn();
  const props = { ref, questions, inputMode: 'question' as 'question' | 'message', draft: 'Версия из профиля', disabled: false, maxBodyHeight: 160,
    loadDraft: async () => '', saveDraft: save, onDraftChange: jest.fn(), onInputModeChange: modeChanged,
    onWriteAnswer: jest.fn(), onSubmit: jest.fn(), onDismiss: jest.fn() };
  const button = (label: string) => view.root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === label)[0];
  try {
    await act(async () => { view = TestRenderer.create(React.createElement(HelpQuestionPanel, props)); });
    await act(async () => button('Свернуть вопросы ИИ').props.onPress());
    expect(modeChanged).toHaveBeenLastCalledWith('message');
    expect(ref.current!.getDraftText()).toBe('Версия из профиля');
    expect(view.root.findAllByProps({ testID: 'help-question-footer' })).toHaveLength(0);
    await act(async () => view.update(React.createElement(HelpQuestionPanel, { ...props, inputMode: 'message', draft: 'Обычное сообщение' })));
    await act(async () => { ref.current!.capture('Обычное сообщение'); await ref.current!.answer('Обычное сообщение'); });
    expect(ref.current!.getDraftText()).toBe('Версия из профиля');
    await act(async () => button('Развернуть вопросы ИИ').props.onPress());
    expect(modeChanged).toHaveBeenLastCalledWith('question');
    await act(async () => view.update(React.createElement(HelpQuestionPanel, props)));
    expect(button('Далее')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).toContain('1 из 2');
    expect(ref.current!.getDraftText()).toBe('Версия из профиля');
    expect(JSON.parse(save.mock.calls.at(-1)[0])).toMatchObject({ index: 0, collapsed: false, answers: { os: { text: 'Версия из профиля' } } });
    expect(props.onSubmit).not.toHaveBeenCalled();
  } finally { await act(async () => view.unmount()); }
});

test('choice and custom-answer edits retain bound file identities rather than accepting a same-name replacement', async () => {
  let view!: TestRenderer.ReactTestRenderer;
  const save = jest.fn().mockResolvedValue(undefined);
  const props = { questions: [questions[0]], draft: '', disabled: false, maxBodyHeight: 160,
    attachmentCount: 1, attachmentNames: ['log.txt'], attachmentKeys: ['file://original'],
    loadDraft: async () => JSON.stringify({ answers: { os: { selected: [], text: '', fileCount: 1, fileNames: ['log.txt'], fileKeys: ['file://original'] } } }),
    saveDraft: save, onDraftChange: jest.fn(), onWriteAnswer: jest.fn(), onSubmit: jest.fn(), onDismiss: jest.fn() };
  const button = (label: string) => view.root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === label)[0];
  try {
    await act(async () => { view = TestRenderer.create(React.createElement(HelpQuestionPanel, props)); });
    await act(async () => button('Windows 11').props.onPress());
    await act(async () => button('Написать свой ответ').props.onPress());
    const saved = JSON.parse(save.mock.calls.at(-1)[0]);
    expect(saved.answers.os.fileKeys).toEqual(['file://original']);
    expect(saved.answers.os.fileNames).toEqual(['log.txt']);
    expect(() => formatHelpQuestionAnswers(props.questions, saved, 1, ['log.txt'], ['file://replacement'])).toThrow('Ответьте');
    expect(formatHelpQuestionAnswers(props.questions, saved, 1, ['log.txt'], ['file://original'])).toContain('См. вложение');
  } finally { await act(async () => view.unmount()); }
});

test.each(['', 'Текущий ответ'])('restoring a previously collapsed panel opens questions without replacing a nonempty current answer (%s)', async initialDraft => {
  let view!: TestRenderer.ReactTestRenderer;
  const ref = React.createRef<HelpQuestionPanelHandle>(), changed = jest.fn();
  let activeDraft = initialDraft, activeMode: 'question' | 'message' = 'question';
  function Harness() {
    const [draft, setDraft] = React.useState(initialDraft), [mode, setMode] = React.useState<'question' | 'message'>('question');
    activeDraft = draft; activeMode = mode;
    return React.createElement(HelpQuestionPanel, { ref, questions, draft, inputMode: mode, disabled: false, maxBodyHeight: 160,
      loadDraft: async () => JSON.stringify({ index: 0, collapsed: true, answers: { os: { selected: [], text: 'Сохранённый ответ на вопрос' } } }),
      saveDraft: async () => {}, onDraftChange: (text: string) => { changed(text); setDraft(text); }, onInputModeChange: setMode,
      onWriteAnswer: jest.fn(), onSubmit: jest.fn(), onDismiss: jest.fn() });
  }
  try {
    await act(async () => { view = TestRenderer.create(React.createElement(Harness)); });
    expect(activeMode).toBe('question');
    expect(activeDraft).toBe(initialDraft||'Сохранённый ответ на вопрос');
    if(initialDraft)expect(changed).not.toHaveBeenCalled();
    else expect(changed).toHaveBeenCalledWith('Сохранённый ответ на вопрос');
    expect(view.root.findAllByProps({ testID: 'help-question-footer' }).length).toBeGreaterThan(0);
    expect(ref.current!.getDraftText()).toBe('Сохранённый ответ на вопрос');
    await act(async () => ref.current!.capture(activeDraft));
    expect(ref.current!.getDraftText()).toBe(activeDraft);
  } finally { await act(async () => view.unmount()); }
});


test('late option presses cannot alter an answer after advancing to another question',async()=>{
  let view!:TestRenderer.ReactTestRenderer;
  const ref=React.createRef<HelpQuestionPanelHandle>(),save=jest.fn().mockResolvedValue(undefined);
  const props={ref,questions,draft:'',disabled:false,maxBodyHeight:240,loadDraft:async()=>'',saveDraft:save,onDraftChange:jest.fn(),onWriteAnswer:jest.fn(),onSubmit:jest.fn()};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpQuestionPanel,props));});
  const button=(label:string)=>view.root.findAll(n=>n.props.accessibilityLabel===label&&typeof n.props.onPress==='function')[0];
  try{
    const stale=button('Windows 10').props.onPress;
    await act(async()=>button('Windows 11').props.onPress());
    await act(async()=>ref.current!.answer(''));
    const writes=save.mock.calls.length;
    await act(async()=>stale());
    expect(save).toHaveBeenCalledTimes(writes);
    expect(JSON.parse(save.mock.calls.at(-1)[0]).answers.os.selected).toEqual(['Windows 11']);
  }finally{await act(async()=>view.unmount());}
});

test('slow storage retains only the newest queued answer snapshot',async()=>{
  let view!:TestRenderer.ReactTestRenderer,release!:()=>void;
  const save=jest.fn().mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;})).mockResolvedValue(undefined);
  const props={questions,draft:'',disabled:false,maxBodyHeight:240,loadDraft:async()=>'',saveDraft:save,onDraftChange:jest.fn(),onWriteAnswer:jest.fn(),onSubmit:jest.fn()};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpQuestionPanel,props));});
  const button=(label:string)=>view.root.findAll(n=>n.props.accessibilityLabel===label&&typeof n.props.onPress==='function')[0];
  try{
    await act(async()=>button('Windows 10').props.onPress());
    await act(async()=>{for(let i=0;i<20;i++)button(i%2?'Windows 11':'Windows 10').props.onPress();});
    expect(button('Windows 11').props.accessibilityState.checked).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    await act(async()=>release());
    expect(save).toHaveBeenCalledTimes(2);
    expect(JSON.parse(save.mock.calls.at(-1)[0]).answers.os.selected).toEqual(['Windows 11']);
  }finally{await act(async()=>view.unmount());}
});
