import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Text} from 'react-native';
jest.mock('../src/features/help/helpApi',()=>({createHelpApi:jest.fn()}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({text:'#111',muted:'#777',accent:'#09f',accentText:'#09f'})}));
import {createHelpApi} from '../src/features/help/helpApi';
import {HelpItBriefPanel} from '../src/features/help/components/HelpItBriefPanel';
const brief={version:1,ticketId:46,throughSequence:9,initialRequest:{text:'Исходная ошибка',messageIds:[1],provenance:'owner'},latestRequest:{text:'Ошибка осталась',messageIds:[8],provenance:'owner'},recentMessages:[{text:'Всё работает',messageIds:[9],provenance:'assistant'}],summary:null,checks:[{text:'read_object',messageIds:[7],provenance:'tool_execution',status:'completed'}]};
let screen:TestRenderer.ReactTestRenderer|undefined;
const load=jest.fn(),onMessage=jest.fn();
const mount=async(ticketId=46,userId=9)=>{await act(async()=>{screen=TestRenderer.create(React.createElement(HelpItBriefPanel,{ticketId,userId,onMessage}));});};
const text=()=>screen!.root.findAllByType(Text).map(value=>value.props.children).join(' ');
beforeEach(()=>{jest.clearAllMocks();(createHelpApi as jest.Mock).mockReturnValue({itBrief:load});load.mockResolvedValue(brief);});
afterEach(async()=>{if(screen)await act(async()=>screen!.unmount());screen=undefined;});
test('loads only the requested ticket with account-scoped API and keeps details collapsed',async()=>{
 await mount();expect(createHelpApi).toHaveBeenCalledWith(9);expect(load).toHaveBeenCalledTimes(1);expect(load).toHaveBeenCalledWith(46);
 expect(text()).toContain('Исходная ошибка');expect(text()).toContain('Ошибка осталась');expect(text()).not.toContain('read_object');
 await act(async()=>screen!.root.findByProps({testID:'help-it-brief-expand'}).props.onPress());
 expect(text()).toContain('read_object');expect(text()).toContain('а не проверку решения');expect(text()).toContain('ИИ');
 expect(load).toHaveBeenCalledTimes(1);
});
test('opens original message using source ID without posting or claiming ticket',async()=>{
 await mount();await act(async()=>screen!.root.findByProps({accessibilityLabel:'Открыть сообщение 8'}).props.onPress());
 expect(onMessage).toHaveBeenCalledWith(8);
});
test('stale request for a previous ticket cannot replace current brief',async()=>{
 let finish!:(value:unknown)=>void;load.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 await mount();load.mockResolvedValue({...brief,ticketId:47,initialRequest:{...brief.initialRequest,text:'Другое обращение'}});
 await act(async()=>screen!.update(React.createElement(HelpItBriefPanel,{ticketId:47,userId:9,onMessage})));
 await act(async()=>finish(brief));
 expect(text()).toContain('Другое обращение');expect(text()).not.toContain('Исходная ошибка');
});
test('keeps failures local and retries explicitly',async()=>{
 load.mockRejectedValueOnce(new Error('private server details'));await mount();
 expect(text()).toContain('Не удалось загрузить');expect(text()).not.toContain('private server details');
 const retry=screen!.root.findAllByProps({accessibilityRole:'button'}).find(value=>value.findAllByType(Text).some(child=>child.props.children==='Повторить'))!;
 await act(async()=>retry.props.onPress());expect(load).toHaveBeenCalledTimes(2);expect(text()).toContain('Исходная ошибка');
});
