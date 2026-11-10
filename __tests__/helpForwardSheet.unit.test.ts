import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Platform,StyleSheet} from 'react-native';
let mockWindow={width:1280,height:800,scale:1,fontScale:1};
jest.mock('react-native/Libraries/Utilities/useWindowDimensions',()=>({__esModule:true,default:()=>mockWindow}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({muted:'#888'})}));
jest.mock('../src/features/help/components/HelpPrimitives',()=>({HelpSheet:'ForwardSheet'}));
jest.mock('../src/features/help/components/HelpTicketRow',()=>({HelpTicketRow:'TicketRow'}));
jest.mock('../src/features/help/components/HelpWebScrollbar',()=>({HelpWebScrollbar:'Scrollbar'}));
import {HelpForwardSheet} from '../src/features/help/components/HelpForwardSheet';
const ticket=(id:number,extra:any={})=>({id,number:id,title:`Обращение ${id}`,ownerId:121,members:[],status:'OPEN',...extra});
let view:TestRenderer.ReactTestRenderer;
const props=()=>({tickets:[ticket(1),ticket(2),ticket(3,{status:'CLOSED'}),ticket(4,{ownerId:9}),ticket(5,{ownerId:9,members:[{userId:121}]})] as any,userId:121,currentTicketId:1,dateNow:1,onForward:jest.fn(async()=>{}),onClose:jest.fn(),onError:jest.fn()});
const rows=()=>view.root.findAllByType('TicketRow' as any);
const node=(id:string)=>view.root.findAllByProps({testID:id})[0];
afterEach(async()=>{if(view)await act(async()=>view.unmount());jest.restoreAllMocks();mockWindow={width:1280,height:800,scale:1,fontScale:1};});
test('destination selection uses shared rows and preserves access/current/closed exclusions',async()=>{
 const p=props();await act(async()=>{view=TestRenderer.create(React.createElement(HelpForwardSheet,p));});
 expect(rows().map(row=>row.props.ticket.id)).toEqual([2,5]);
 for(const row of rows()){expect(row.props.diagnostics).toBe(false);expect(row.props.onMenu).toBeUndefined();}
 await act(async()=>rows()[1].props.onPress());expect(p.onForward).toHaveBeenCalledWith(p.tickets[4]);
});
test('one in-flight forward disables destinations and a failed send can be retried',async()=>{
 const p=props();let reject!:(error:Error)=>void;
 p.onForward.mockImplementationOnce(()=>new Promise((_resolve,fail)=>{reject=fail;}));
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpForwardSheet,p));});
 const press=rows()[0].props.onPress;
 await act(async()=>{press();press();});expect(p.onForward).toHaveBeenCalledTimes(1);
 expect(rows().every(row=>row.props.disabled)).toBe(true);
 await act(async()=>reject(new Error('Нет связи')));expect(p.onError).toHaveBeenCalledWith('Нет связи');
 expect(rows().every(row=>!row.props.disabled)).toBe(true);
 await act(async()=>rows()[0].props.onPress());expect(p.onForward).toHaveBeenCalledTimes(2);
});
test('desktop has one scroll owner and the same custom scrollbar, including a short viewport',async()=>{
 jest.replaceProperty(Platform,'OS','web');const p=props();p.tickets=Array.from({length:20},(_,i)=>ticket(i+10));
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpForwardSheet,p));});
 expect(view.root.findByType('ForwardSheet' as any).props).toMatchObject({scrollable:false,maxWidth:560});
 const list=node('help-forward-list'),bar=view.root.findByType('Scrollbar' as any);
 expect(list.props.showsVerticalScrollIndicator).toBe(false);expect(bar.props.scrollId).toBe(list.props.nativeID);
 expect(StyleSheet.flatten(node('help-forward-list-frame').props.style).height).toBe(456);
 mockWindow={...mockWindow,height:250};await act(async()=>view.update(React.createElement(HelpForwardSheet,p)));
 expect(StyleSheet.flatten(node('help-forward-list-frame').props.style).height).toBeLessThanOrEqual(90);
});
test('native keeps its own indicator and passes actual scroll offset to the sheet gesture',async()=>{
 jest.replaceProperty(Platform,'OS','android');mockWindow={...mockWindow,width:390,height:844};
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpForwardSheet,props()));});
 expect(view.root.findAllByType('Scrollbar' as any)).toHaveLength(0);
 expect(node('help-forward-list').props.showsVerticalScrollIndicator).toBe(true);
 await act(async()=>node('help-forward-list').props.onScroll({nativeEvent:{contentOffset:{y:86}}}));
 expect(view.root.findByType('ForwardSheet' as any).props.scrollOffset).toBe(86);
});
