import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
jest.mock('react-native',()=>({Text:'Text',View:'View',ScrollView:'ScrollView',Platform:{OS:'android'},Alert:{alert:jest.fn()},Linking:{openURL:jest.fn()},AppState:{currentState:'active',addEventListener:()=>({remove:jest.fn()})},AccessibilityInfo:{isScreenReaderEnabled:async()=>false,addEventListener:()=>({remove:jest.fn()})}}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({text:'#fff',muted:'#aaa',accentText:'#48f',elevated:'#222',line:'#333'}),useHelpReducedMotion:()=>false}));
import {HelpStreamingAnswer,HelpStreamingAnalysis} from '../src/features/help/components/HelpStreamingText';
import {helpMarkdownParser} from '../src/features/help/helpMarkdownModel';
import * as markdownModel from '../src/features/help/helpMarkdownModel';
let view:TestRenderer.ReactTestRenderer;
const textOf=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(textOf).join(''):node?.children?node.children.map(textOf).join(''):'';
const answer=(text:string,status:'streaming'|'completed'|'stopped'|'error'='streaming')=>React.createElement(HelpStreamingAnswer,{identity:'answer',text,status,draft:status!=='completed'});
beforeEach(()=>{jest.useFakeTimers({doNotFake:['queueMicrotask']});jest.setSystemTime(0);});
afterEach(async()=>{if(view)await act(async()=>view.unmount());jest.useRealTimers();jest.restoreAllMocks();});
test('renders actual increasing prefixes and memoizes already finished Markdown paragraphs during later ticks',async()=>{
 const parse=jest.spyOn(helpMarkdownParser,'parse'),first='**Первый абзац.**\n\n',body=first+'Второй абзац '.repeat(20);
 await act(async()=>{view=TestRenderer.create(answer(''));});expect(view.toJSON()).toBeNull();
 await act(async()=>view.update(answer(body)));expect(view.toJSON()).toBeNull();
 await act(async()=>jest.advanceTimersByTime(40));const initial=textOf(view.toJSON());expect(initial).toContain('Первый абзац.');expect(initial.length).toBeLessThan(body.length);
 const parsesOfFirst=()=>parse.mock.calls.filter(([text])=>text===first).length;
 expect(parsesOfFirst()).toBe(1);
 for(let i=0;i<4;i++)await act(async()=>jest.advanceTimersByTime(40));
 expect(parsesOfFirst()).toBe(1);expect(view.root.findAllByProps({testID:'help-assistant-text'})).toHaveLength(2);
 await act(async()=>view.update(answer(body+'Продолжение.')));await act(async()=>jest.advanceTimersByTime(40));expect(parsesOfFirst()).toBe(1);
 await act(async()=>jest.advanceTimersByTime(160));expect(textOf(view.toJSON())).toContain('Продолжение.');
});
test('historical Markdown is shown immediately, including lists, table, code and reference links',async()=>{
 const blocks=jest.spyOn(markdownModel,'helpMarkdownBlocks'),parse=jest.spyOn(helpMarkdownParser,'parse');
 const text='# Ответ\n\n1. Первый\n2. Второй\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```txt\nкод\n```\n\n[Источник][doc]\n\n[doc]: https://example.test';
 await act(async()=>{view=TestRenderer.create(answer(text,'completed'));});const rendered=textOf(view.toJSON());expect(rendered).toContain('Первый');expect(rendered).toContain('код');expect(rendered).toContain('Источник');expect(rendered).not.toContain('Формируется');expect(jest.getTimerCount()).toBe(0);
 expect(view.root.findAll(node=>node.props.accessibilityRole==='link').length).toBeGreaterThan(0);
 expect(blocks).not.toHaveBeenCalled();expect(parse).toHaveBeenCalledTimes(1);
 expect(view.root.findAllByProps({testID:'help-assistant-text'})).toHaveLength(1);
});
test('completion retains streamed block instances, while another historical identity uses one parse',async()=>{
 const first='**Готовый абзац.**\n\n',body=first+'Следующий абзац '.repeat(20);
 await act(async()=>{view=TestRenderer.create(answer(body));});
 const firstBlock=view.root.findAllByProps({testID:'help-assistant-text'})[0];
 await act(async()=>view.update(answer(body,'completed')));
 await act(async()=>jest.advanceTimersByTime(120));
 expect(view.root.findAllByProps({testID:'help-assistant-text'})[0]).toBe(firstBlock);
 expect(view.root.findAllByProps({testID:'help-assistant-text'})).toHaveLength(2);
 const blocks=jest.spyOn(markdownModel,'helpMarkdownBlocks'),parse=jest.spyOn(helpMarkdownParser,'parse');
 await act(async()=>view.update(React.createElement(HelpStreamingAnswer,{identity:'saved-other',text:body,status:'completed',draft:false})));
 expect(blocks).not.toHaveBeenCalled();expect(parse).toHaveBeenCalledTimes(1);
 expect(view.root.findAllByProps({testID:'help-assistant-text'})).toHaveLength(1);
});
test('public analysis shares the same live reveal and does not replay finished activities',async()=>{
 const analysis=(text:string,active=true)=>React.createElement(HelpStreamingAnalysis,{identity:'analysis',text,active,completed:!active});
 await act(async()=>{view=TestRenderer.create(analysis(''));});await act(async()=>view.update(analysis('Проверяю реальные данные.')));
 expect(view.toJSON()).toBeNull();await act(async()=>jest.advanceTimersByTime(40));expect(textOf(view.toJSON()).length).toBeGreaterThan(0);expect(textOf(view.toJSON())).not.toBe('Проверяю реальные данные.');
 await act(async()=>view.update(analysis('Проверяю реальные данные.',false)));await act(async()=>jest.advanceTimersByTime(120));expect(textOf(view.toJSON())).toBe('Проверяю реальные данные.');expect(jest.getTimerCount()).toBe(0);
});
test('an error removes a previously visible draft immediately and leaves no animation',async()=>{
 await act(async()=>{view=TestRenderer.create(answer(''));});await act(async()=>view.update(answer('Незавершённый ответ')));await act(async()=>jest.advanceTimersByTime(40));expect(view.toJSON()).not.toBeNull();
 await act(async()=>view.update(answer('','error')));expect(view.toJSON()).toBeNull();expect(jest.getTimerCount()).toBe(0);
});
