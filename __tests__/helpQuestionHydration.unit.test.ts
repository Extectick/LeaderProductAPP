import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';

jest.mock('../context/ThemeContext', () => ({useTheme: () => ({theme: 'light'})}));
jest.mock('@expo/vector-icons', () => ({Ionicons: 'Ionicons'}));
jest.mock('../src/features/help/components/HelpQuestionReveal', () => ({
  HelpQuestionReveal: ({collapsed, children, collapsedContent}: any) => collapsed ? collapsedContent : children,
}));

jest.mock('../src/features/help/components/HelpQuestionTransition',()=>({HelpQuestionTransition:({children,...props}:any)=>require('react').createElement('QuestionTransition',props,children)}));
import {HelpQuestionPanel, type HelpQuestionPanelHandle} from '../src/features/help/components/HelpQuestionPanel';

const questions = [
  {id: 'one', header: 'Первый', question: 'Первый вопрос?', multiSelect: false, options: [{label: 'Ответ A'}]},
  {id: 'two', header: 'Второй', question: 'Второй вопрос?', multiSelect: true, options: [{label: 'Ответ B'}]},
  {id: 'three', header: 'Третий', question: 'Третий вопрос?', multiSelect: false, options: []},
];

test('an obsolete hydration cannot replace two fresh answers with old skip flags before the last Skip', async () => {
  const loads: ((raw: string) => void)[] = [];
  const ref = React.createRef<HelpQuestionPanelHandle>();
  const submit = jest.fn().mockResolvedValue(true);
  const save = jest.fn().mockResolvedValue(undefined);
  const props = {ref, integrated: true, submitOnLastAnswer: true, questions, draft: '', disabled: false, maxBodyHeight: 200,
    loadDraft: () => new Promise<string>(resolve => loads.push(resolve)), saveDraft: save,
    onDraftChange: jest.fn(), onWriteAnswer: jest.fn(), onSubmit: submit};
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {view = TestRenderer.create(React.createElement(React.StrictMode, null, React.createElement(HelpQuestionPanel, props)));});
  try {
    expect(loads).toHaveLength(2);
    await act(async () => loads[1](''));
    const press = (label: string) => view.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0].props.onPress();
    await act(async () => press('Ответ A'));
    await act(async () => {await ref.current!.answer('');});
    await act(async () => press('Ответ B'));
    await act(async () => {await ref.current!.answer('');});
    expect(JSON.stringify(view.toJSON())).toContain('3 из 3');

    // StrictMode/Fast Refresh may leave an older asynchronous read in flight.
    await act(async () => loads[0](JSON.stringify({index: 2, answers: {
      one: {selected: [], text: '', skipped: true}, two: {selected: [], text: '', skipped: true},
    }})));
    expect(submit).not.toHaveBeenCalled();
    await act(async () => {ref.current!.skip(); ref.current!.skip();});
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith('Первый вопрос?\nОтвет: Ответ A\n\nВторой вопрос?\nОтвет: Ответ B\n\nТретий вопрос?\nВопрос пропущен пользователем.');
    expect(save).toHaveBeenLastCalledWith('');
  } finally {await act(async () => view.unmount());}
});

test('an obsolete read cannot enable interaction before the active hydration finishes', async () => {
  const loads: ((raw: string) => void)[] = [];
  const ref = React.createRef<HelpQuestionPanelHandle>(), submit = jest.fn();
  const props = {ref, integrated: true, submitOnLastAnswer: true, questions, draft: '', disabled: false, maxBodyHeight: 200,
    loadDraft: () => new Promise<string>(resolve => loads.push(resolve)), saveDraft: jest.fn().mockResolvedValue(undefined),
    onDraftChange: jest.fn(), onWriteAnswer: jest.fn(), onSubmit: submit};
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {view = TestRenderer.create(React.createElement(React.StrictMode, null, React.createElement(HelpQuestionPanel, props)));});
  try {
    expect(loads).toHaveLength(2);
    await act(async () => loads[0](JSON.stringify({index: 2, answers: {one: {skipped: true}, two: {skipped: true}}})));
    expect(view.toJSON()).toBeNull();
    await act(async () => {ref.current!.skip();});
    expect(submit).not.toHaveBeenCalled();
    await act(async () => loads[1](''));
    expect(JSON.stringify(view.toJSON())).toContain('1 из 3');
    expect(submit).not.toHaveBeenCalled();
  } finally {await act(async () => view.unmount());}
});

test('a new mount opens the saved question while preserving answers and the current mount keeps manual collapse',async()=>{
  let saved=JSON.stringify({index:1,collapsed:true,answers:{
    one:{selected:['Ответ A'],text:''},
    two:{selected:['Ответ B'],text:'Сохранённый ответ',fileCount:1,fileNames:['log.txt'],fileKeys:['file://log.txt']},
  }});
  const ref=React.createRef<HelpQuestionPanelHandle>();
  const props={ref,integrated:true,submitOnLastAnswer:true,questions,draft:'Сохранённый ответ',inputMode:'question' as const,disabled:false,maxBodyHeight:200,
    attachmentCount:1,attachmentNames:['log.txt'],attachmentKeys:['file://log.txt'],loadDraft:async()=>saved,saveDraft:jest.fn(async(value:string)=>{saved=value;}),onDraftChange:jest.fn(),onWriteAnswer:jest.fn(),onSubmit:jest.fn()};
  let view!:TestRenderer.ReactTestRenderer;
  const press=(label:string)=>view.root.findAll(node=>node.props.accessibilityLabel===label&&typeof node.props.onPress==='function')[0].props.onPress();
  try{
    await act(async()=>{view=TestRenderer.create(React.createElement(HelpQuestionPanel,props));});
    expect(JSON.stringify(view.toJSON())).toContain('Второй вопрос?');
    expect(ref.current!.getDraftText()).toBe('Сохранённый ответ');
    await act(async()=>press('Свернуть вопросы ИИ'));
    expect(JSON.parse(saved)).toMatchObject({index:1,collapsed:true,answers:{one:{selected:['Ответ A']},two:{selected:['Ответ B'],text:'Сохранённый ответ',fileKeys:['file://log.txt']}}});
    await act(async()=>view.update(React.createElement(HelpQuestionPanel,{...props,maxBodyHeight:180})));
    expect(JSON.stringify(view.toJSON())).toContain('ИИ ожидает ответ');
    expect(JSON.stringify(view.toJSON())).not.toContain('Второй вопрос?');
    await act(async()=>view.unmount());
    await act(async()=>{view=TestRenderer.create(React.createElement(HelpQuestionPanel,props));});
    expect(JSON.stringify(view.toJSON())).toContain('Второй вопрос?');
    expect(ref.current!.getDraftText()).toBe('Сохранённый ответ');
    expect(props.onSubmit).not.toHaveBeenCalled();
  }finally{await act(async()=>view.unmount());}
});
