import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
let mockReduced=false;
const mockEvents:Record<string,Function>={};
jest.mock('react-native',()=>({Platform:{OS:'android'},AppState:{currentState:'active',addEventListener:jest.fn((_:string,fn:Function)=>{mockEvents.app=fn;return{remove:jest.fn()};})},AccessibilityInfo:{isScreenReaderEnabled:jest.fn(async()=>false),addEventListener:jest.fn((_:string,fn:Function)=>{mockEvents.reader=fn;return{remove:jest.fn()};})}}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpReducedMotion:()=>mockReduced}));
import {AppState,AccessibilityInfo,Platform} from 'react-native';
import {useHelpTextReveal} from '../src/features/help/useHelpTextReveal';
import {HelpVisualEffectsContext} from '../src/features/help/helpVisualEffects';
let texts:Record<string,string>={};let view:TestRenderer.ReactTestRenderer;
type Props={identity:string;text:string;active:boolean;completed?:boolean};
function Item(props:Props){texts[props.identity]=useHelpTextReveal(props);return null;}
const r=(text:string,active=true,completed=false,identity='r')=>React.createElement(Item,{identity,text,active,completed});
beforeEach(()=>{jest.useFakeTimers({doNotFake:['queueMicrotask']});jest.setSystemTime(0);texts={};mockReduced=false;AppState.currentState='active';(AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockResolvedValue(false);});
afterEach(async()=>{if(view)await act(async()=>view.unmount());jest.useRealTimers();jest.restoreAllMocks();});
test('live chunks grow progressively, finish within the bounded word buffer and release the clock',async()=>{
 await act(async()=>{view=TestRenderer.create(r(''));});await act(async()=>view.update(r('Ответ '.repeat(20))));
 expect(texts.r).toBe('');expect(jest.getTimerCount()).toBe(1);
 await act(async()=>jest.advanceTimersByTime(40));expect(texts.r.length).toBeGreaterThan(0);expect(texts.r.length).toBeLessThan(120);
 await act(async()=>jest.advanceTimersByTime(40));expect(texts.r).toBe('Ответ '.repeat(20));expect(jest.getTimerCount()).toBe(0);
});
test('several live texts share one clock and one pair of native subscriptions',async()=>{
 const beforeApp=(AppState.addEventListener as jest.Mock).mock.calls.length,beforeReader=(AccessibilityInfo.addEventListener as jest.Mock).mock.calls.length;
 const body=(text:string)=>React.createElement(React.Fragment,null,r(text,true,false,'answer'),r(text,true,false,'analysis'));
 await act(async()=>{view=TestRenderer.create(body(''));});await act(async()=>view.update(body('А'.repeat(50))));
 expect(jest.getTimerCount()).toBe(1);expect((AppState.addEventListener as jest.Mock).mock.calls.length-beforeApp).toBe(1);expect((AccessibilityInfo.addEventListener as jest.Mock).mock.calls.length-beforeReader).toBe(1);
 await act(async()=>view.unmount());expect(jest.getTimerCount()).toBe(0);
});
test('cached history never replays and changing identities cannot flash the previous answer',async()=>{
 await act(async()=>{view=TestRenderer.create(r('Готовая история',false,true));});expect(texts.r).toBe('Готовая история');expect(jest.getTimerCount()).toBe(0);
 await act(async()=>view.update(r('Другой чат',true,false,'new')));expect(texts.new).toBe('Другой чат');expect(jest.getTimerCount()).toBe(0);
});
test('background and a covered chat snap to the latest text without an idle timer or replay on return',async()=>{
 const body=(text:string,focused=true)=>React.createElement(HelpVisualEffectsContext.Provider,{value:focused},r(text));
 await act(async()=>{view=TestRenderer.create(body(''));});await act(async()=>view.update(body('Длинный ответ')));
 await act(async()=>{AppState.currentState='background';mockEvents.app('background');});expect(texts.r).toBe('Длинный ответ');expect(jest.getTimerCount()).toBe(0);
 await act(async()=>view.update(body('Длинный ответ продолжен')));expect(texts.r).toBe('Длинный ответ продолжен');
 await act(async()=>{AppState.currentState='active';mockEvents.app('active');});expect(jest.getTimerCount()).toBe(0);
 await act(async()=>view.update(body('Длинный ответ продолжен ещё',false)));expect(texts.r).toBe('Длинный ответ продолжен ещё');expect(jest.getTimerCount()).toBe(0);
});
test('reduce motion and screen reader disable typing, including mid-stream changes',async()=>{
 await act(async()=>{view=TestRenderer.create(r(''));});await act(async()=>view.update(r('Новый ответ')));
 await act(async()=>mockEvents.reader(true));expect(texts.r).toBe('Новый ответ');expect(jest.getTimerCount()).toBe(0);
 await act(async()=>mockEvents.reader(false));mockReduced=true;
 await act(async()=>view.update(r('Новый ответ с продолжением')));expect(texts.r).toBe('Новый ответ с продолжением');expect(jest.getTimerCount()).toBe(0);
});
test('a stopped or failed response does not keep typing and a completed stream immediately shows the final text',async()=>{
 await act(async()=>{view=TestRenderer.create(r(''));});await act(async()=>view.update(r('Частичный ответ')));
 await act(async()=>view.update(r('Частичный ответ',false,false)));expect(texts.r).toBe('Частичный ответ');expect(jest.getTimerCount()).toBe(0);
 await act(async()=>view.update(r('',false,false)));expect(texts.r).toBe('');
 await act(async()=>view.update(r('',true,false,'next')));await act(async()=>view.update(r('Финальный ответ',true,false,'next')));
 await act(async()=>view.update(r('Финальный ответ',false,true,'next')));expect(texts.next).toBe('Финальный ответ');expect(jest.getTimerCount()).toBe(0);
});

test('web constant-true screen reader stub does not disable typing; reduced motion still does',async()=>{
 jest.replaceProperty(Platform,'OS','web');
 const query=AccessibilityInfo.isScreenReaderEnabled as jest.Mock;
 const subscribe=AccessibilityInfo.addEventListener as jest.Mock;
 query.mockClear().mockResolvedValue(true);subscribe.mockClear();
 await act(async()=>{view=TestRenderer.create(r(''));});
 await act(async()=>view.update(r('Плавный ответ')));
 expect(query).not.toHaveBeenCalled();
 expect(subscribe).not.toHaveBeenCalledWith('screenReaderChanged',expect.anything());
 expect(texts.r).toBe('');
 await act(async()=>jest.advanceTimersByTime(20));expect(texts.r).toBe('Плавный ');
 mockReduced=true;await act(async()=>view.update(r('Плавный ответ целиком')));
 expect(texts.r).toBe('Плавный ответ целиком');expect(jest.getTimerCount()).toBe(0);
});
test('native screen reader true still renders complete text immediately',async()=>{
 (AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockResolvedValue(true);
 await act(async()=>{view=TestRenderer.create(r(''));});
 await act(async()=>view.update(r('Ответ для экранного диктора')));
 expect(texts.r).toBe('Ответ для экранного диктора');expect(jest.getTimerCount()).toBe(0);
});
