import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Text} from 'react-native';
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({panel:'#eef',text:'#123'})}));
jest.mock('../src/features/help/components/HelpViewerLayout',()=>({HelpViewerLayout:'SharedViewerLayout',HELP_VIEWER_HEADER_HEIGHT:80}));
jest.mock('../src/features/entityCards/entityCardActions',()=>({copyEntityCardLink:jest.fn(async()=>{})}));
import {EntityCardViewer} from '../src/features/entityCards/EntityCardViewer';
import {copyEntityCardLink} from '../src/features/entityCards/entityCardActions';
import type {EntityCardState} from '../src/features/entityCards/entityCardState';
import type {EntityTarget} from '../src/shared/entityLinks';
const profile:EntityTarget={v:1,source:'app',kind:'user',id:'121'};
const order:EntityTarget={v:1,source:'onec',baseKey:'torg2026',metaType:'Documents',name:'ЗаказКлиента',guid:'12345678-abcd-1234-abcd-123456789abc'};
function state(target:EntityTarget=profile):EntityCardState{return {account:'dev:121',session:1,sequence:1,closing:false,frames:[{key:1,kind:'entity',target,title:'Карточка',scrollOffset:0}]};}
const back=jest.fn(),close=jest.fn();let view:TestRenderer.ReactTestRenderer;
const tree=(value=state(),userId=121)=>React.createElement(EntityCardViewer,{state:value,userId,onBack:back,onClose:close,bottomInset:24},React.createElement(Text,null,'Original card body'));
const layout=()=>view.root.findAll(node=>node.type==='SharedViewerLayout')[0];
beforeEach(()=>{jest.clearAllMocks();});afterEach(async()=>{if(view)await act(async()=>view.unmount());});
test.each([profile,order])('profiles and 1C objects use the same shared viewer component: %j',async target=>{
 await act(async()=>{view=TestRenderer.create(tree(state(target)));});
 expect(layout().props.testIDPrefix).toBe('entity-card');expect(layout().props.bottomInset).toBe(24);expect(layout().props.backLabel).toBe('Закрыть просмотр');
 await act(async()=>layout().props.onBack());expect(back).toHaveBeenCalledTimes(1);
 const actions=layout().props.actions;expect(actions.map((a:any)=>a.label)).toEqual(['Ссылка','Закрыть просмотр']);
 await act(async()=>actions.find((a:any)=>a.id==='link').onPress());
 expect(copyEntityCardLink).toHaveBeenCalledWith(target,expect.objectContaining({expectedUserId:121,signal:expect.any(AbortSignal),isCurrent:expect.any(Function)}));
 expect(view.root.findAllByType(Text).some(node=>node.props.children==='Ссылка скопирована')).toBe(true);
 await act(async()=>layout().props.actions.find((a:any)=>a.id==='close').onPress());expect(close).toHaveBeenCalledTimes(1);
});
test('nested back retains navigation history and connection pages never copy a credential form link',async()=>{
 const value=state();value.frames.push({key:2,kind:'connection',baseKey:'torg2026',title:'Подключение 1С',scrollOffset:0});
 await act(async()=>{view=TestRenderer.create(tree(value));});
 expect(layout().props.backLabel).toBe('Назад к предыдущей карточке');expect(layout().props.actions.map((a:any)=>a.id)).toEqual(['close']);
 await act(async()=>layout().props.onBack());expect(back).toHaveBeenCalledTimes(1);expect(close).not.toHaveBeenCalled();
});
test('late copy completion after account/frame change cannot publish old feedback',async()=>{
 let finish!:()=>void;jest.mocked(copyEntityCardLink).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 await act(async()=>{view=TestRenderer.create(tree());});await act(async()=>layout().props.actions.find((a:any)=>a.id==='link').onPress());
 const options=jest.mocked(copyEntityCardLink).mock.calls[0][1];
 await act(async()=>view.update(tree({...state(order),account:'dev:122'},122)));expect(options.signal.aborted).toBe(true);expect(options.isCurrent?.()).toBe(false);
 await act(async()=>finish());expect(view.root.findAllByType(Text).some(node=>node.props.children==='Ссылка скопирована')).toBe(false);
});
