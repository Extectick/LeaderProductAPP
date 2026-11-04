import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Animated,StyleSheet,View} from 'react-native';
import { helpNavigationIndex, helpIsAtLatest, helpTimelineRows, helpVisibleRows, helpTimelineEntries, helpMessageGroups } from '../src/features/help/helpTimelineModel';
import type { HelpMessage } from '../src/features/help/helpApi';
let mockFlashProps:any;
let mockReducedMotion=true;
let mockNativeChatLayout=false;
const mockTailTiming=jest.fn((value:number,_config:any)=>value);
const mockTailCancel=jest.fn();
jest.mock('react-native-reanimated',()=>({
  __esModule:true,default:{View:require('react-native').View},runOnUI:(fn:any)=>fn,useSharedValue:(value:number)=>require('react').useRef({value}).current,
  useAnimatedStyle:(fn:()=>any)=>fn(),withTiming:(value:number,config:any)=>mockTailTiming(value,config),cancelAnimation:(value:any)=>mockTailCancel(value),Easing:{out:(fn:any)=>fn,cubic:(x:number)=>x},
}));
let mockLayouts:{y:number;height:number}[]=[];
const mockListApi:any={};
jest.mock('@shopify/flash-list',()=>{
  const React=require('react');
  // FlashList's recycled holders retain their rendered child while item,
  // renderer and extraData are unchanged. Keep that boundary in this harness.
  const Row=React.memo(({item,index,renderItem,extraData}:any)=>React.createElement('TimelineRow',null,renderItem({item,index,extraData})));
  return {FlashList:React.forwardRef((props:any,ref:any)=>{
    mockFlashProps=props;React.useImperativeHandle(ref,()=>mockListApi);
    return React.createElement('FlashList',props,props.data.map((item:any,index:number)=>React.createElement(Row,{key:item.key,item,index,renderItem:props.renderItem,extraData:props.extraData})));
  })};
});
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpReducedMotion:()=>mockReducedMotion,useHelpTheme:()=>({background:'#151B22',surface:'#222B35',line:'#33404E',panel:'#1E2730',muted:'#A6B0BE',accentText:'#68B0FF'})}));
jest.mock('../src/features/help/helpDiagnostics',()=>({helpDevActions:()=>()=>{},helpDevProbe:()=>()=>{},helpDevState:jest.fn(),helpDevEvent:jest.fn()}));
jest.mock('../src/features/help/components/HelpNativeChatLayout',()=>({get hasNativeChatLayout(){return mockNativeChatLayout;}}));
import {HelpTimeline,type HelpTimelineHandle} from '../src/features/help/components/HelpTimeline';
import {HelpDateSeparator} from '../src/features/help/components/HelpTimelineIndicators';
import {HelpMediaLoadingContext} from '../src/features/help/helpMediaLoading';
import {HelpMessageArrival} from '../src/features/help/components/HelpMessageArrival';

const message=(sequence:number,date='2026-10-28T12:00:00Z')=>({id:sequence,sequence,createdAt:date}) as HelpMessage;
describe('messenger viewport and read boundaries',()=>{
  test('nonmonotonic dates keep recycled row keys unique',()=>{
    const rows=helpTimelineRows([message(1),message(2,'2026-10-29T12:00:00Z'),message(3)]);
    expect(new Set(rows.map(row=>row.key)).size).toBe(rows.length);
  });
  test('missing saved or unread anchors resolve to a visible neighbour',()=>{
    const rows=helpTimelineRows([message(10),message(12)]);
    expect(rows[helpNavigationIndex(rows,{kind:'anchor',key:1,messageId:11,sequence:11,offset:0})].message.id).toBe(12);
    expect(rows[helpNavigationIndex(rows,{kind:'unread',key:2,messageId:10,sequence:10})].message.id).toBe(10);
    expect(rows[helpNavigationIndex(rows,{kind:'anchor',key:3,messageId:99,sequence:99,offset:0})].message.id).toBe(12);
    expect(helpNavigationIndex([],{kind:'latest',key:4})).toBe(-1);
  });
  test('cells below composer or behind header are not read, partial tall cells remain readable',()=>{
    const rows=[{id:1,top:0,height:80},{id:2,top:70,height:500},{id:3,top:580,height:200}];
    expect(helpVisibleRows(rows,100,570).map(row=>row.id)).toEqual([2]);
    expect(helpVisibleRows(rows,100,600).map(row=>row.id)).toEqual([2]);
    expect(helpVisibleRows(rows,100,620).map(row=>row.id)).toEqual([2,3]);
  });
  test('bottom of an intermediate page is not the bottom of the conversation',()=>{
    expect(helpIsAtLatest(1000,700,400,100,true)).toBe(false);
    expect(helpIsAtLatest(1000,700,400,100,false)).toBe(true);
    expect(helpIsAtLatest(1000,500,400,100,false)).toBe(false);
  });
  test('date headers and unread boundary survive page joins without duplicating a day',()=>{
    const rows=helpTimelineRows([message(1,'2026-10-27T12:00:00Z'),message(2),message(3)],3);
    expect(rows.map(row=>row.kind)).toEqual(['date','message','date','message','unread','message']);
    expect(rows[2].date).toBe('2026-10-28T12:00:00Z');
    const before=helpTimelineRows([message(3)],3),after=helpTimelineRows([message(2),message(3)],3);
    expect(before.find(row=>row.kind==='message')?.key).toBe(after.find(row=>row.message.id===3&&row.kind==='message')?.key);
  });
});

describe('outbox row identity',()=>{
  const pending={key:'qa-stable',ticketId:7,create:false,createdAt:Date.parse('2026-10-28T12:00:00Z'),status:'sending' as const,input:{text:'QA stable receipt',clientMessageId:'qa-stable'}};
  test('acknowledgement retains the same cell and date keys without a duplicate outbox row',()=>{
    const before=helpTimelineRows([],null,[pending]);
    const after=helpTimelineRows([{...message(40),clientMessageId:pending.key}],null,[pending]);
    expect(before.map(row=>row.kind)).toEqual(['date','pending']);
    expect(after.map(row=>row.kind)).toEqual(['date','message']);
    expect(before.map(row=>row.key)).toEqual(after.map(row=>row.key));
    expect(after.filter(row=>row.pending)).toHaveLength(0);
  });
  test('pending rows cannot become a persisted history anchor or unread boundary',()=>{
    const rows=helpTimelineRows([],0,[pending]);
    expect(rows.some(row=>row.kind==='unread')).toBe(false);
    expect(helpNavigationIndex(rows,{key:1,kind:'anchor',messageId:-1,sequence:0})).toBe(-1);
    expect(helpNavigationIndex(rows,{key:2,kind:'latest'})).toBe(rows.length-1);
  });
  test('receipt preserves group margins for both the accepted message and its neighbour',()=>{
    const previous={...message(1),authorId:5,authorRole:'USER' as const,kind:'TEXT' as const};
    const before=helpTimelineEntries([previous],[pending],5).map(entry=>entry.message);
    const accepted={...before[1],id:40,sequence:40};
    const beforeGroups=helpMessageGroups(before),afterGroups=helpMessageGroups([previous,accepted]);
    expect(beforeGroups.get(previous.id)).toEqual(afterGroups.get(previous.id));
    expect(beforeGroups.get(before[1].id)).toEqual(afterGroups.get(accepted.id));
  });
});

describe('sticky date geometry and navigation integration',()=>{
  let screen:TestRenderer.ReactTestRenderer|undefined;
  let props:React.ComponentProps<typeof HelpTimeline>;
  let ref:React.RefObject<HelpTimelineHandle|null>;
  const firstDate='2026-10-27T12:00:00Z',nextDate='2026-10-28T12:00:00Z';
  beforeEach(()=>{
    jest.useFakeTimers();
    mockReducedMotion=true;
    mockNativeChatLayout=false;
    mockFlashProps=undefined;
    // The first day's separator has already passed the header. The next day's
    // separator is visible lower in the list and must not hide the current day.
    mockLayouts=[{y:40,height:44},{y:90,height:100},{y:320,height:44},{y:364,height:100}];
    Object.assign(mockListApi,{computeVisibleIndices:()=>({startIndex:0,endIndex:3}),getFirstItemOffset:()=>0,getAbsoluteLastScrollOffset:()=>0,getLayout:(index:number)=>mockLayouts[index],getWindowSize:()=>({width:390,height:600}),getChildContainerDimensions:()=>undefined,scrollToEnd:jest.fn(),scrollToIndex:jest.fn().mockResolvedValue(undefined),scrollToOffset:jest.fn(),getNativeScrollRef:()=>null});
    props={messages:[message(1,firstDate),message(2,nextDate)],nativeID:'timeline-test',headerHeight:100,dockHeight:60,online:true,active:true,
      loadOlder:jest.fn().mockResolvedValue(undefined),loadNewer:jest.fn().mockResolvedValue(undefined),onLatest:jest.fn().mockResolvedValue(undefined),onDate:jest.fn().mockResolvedValue(undefined),onSave:jest.fn(),onRead:jest.fn(),onFollow:jest.fn(),onHighlight:jest.fn(),onError:jest.fn(),onStickyDateChange:jest.fn(),renderMessage:row=>React.createElement(View,{testID:`message-${row.id}`})};
    ref=React.createRef<HelpTimelineHandle>();
  });
  afterEach(async()=>{if(screen)await act(async()=>screen!.unmount());screen=undefined;jest.clearAllTimers();jest.useRealTimers();});
  test('a still-visible inline day hides its sticky copy even when FlashList starts at the next message',async()=>{
    mockLayouts[0]={y:110,height:44};mockLayouts[1]={y:154,height:100};
    mockListApi.computeVisibleIndices=()=>({startIndex:1,endIndex:3});
    await render();expect(floating()).toBeUndefined();
    mockLayouts[0]={y:50,height:44};mockLayouts[1]={y:90,height:100};
    await observe();expect(floating()!.props.date).toBe(firstDate);
  });
  test('short bottom-aligned histories include the library margin and keep one date pill',async()=>{
    props={...props,bottomAligned:true};
    mockListApi.getChildContainerDimensions=()=>({width:390,height:464});
    await render();
    expect(floating()).toBeUndefined();
  });
  test('appending a short native history animates its older rows with the arriving row',async()=>{
    mockReducedMotion=false;mockNativeChatLayout=true;props={...props,bottomAligned:true};
    let height=300;mockListApi.getChildContainerDimensions=()=>({width:390,height});
    await render();mockTailTiming.mockClear();
    height=360;props={...props,messages:[...props.messages,message(3,nextDate)]};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(mockTailTiming).toHaveBeenCalledWith(0,expect.objectContaining({duration:220}));
    expect(require('../src/features/help/helpDiagnostics').helpDevEvent).toHaveBeenCalledWith('timeline.tailShift',expect.objectContaining({delta:60,native:true}));
    mockTailTiming.mockClear();height=420;
    props={...props,messages:[message(0,'2026-10-26T12:00:00Z'),...props.messages]};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(mockTailTiming).not.toHaveBeenCalled();
    // The following layout commit may contain the real sizes of prepended
    // cells; it must not reclassify that history load as a live tail arrival.
    height=440;await act(async()=>mockFlashProps.onCommitLayoutEffect());
    expect(mockTailTiming).not.toHaveBeenCalled();
  });
  test.each([['TEXT',60],['AUDIO',88],['IMAGE',360]])('%s lifts a long native history by its measured height on one clock',async(kind,growth)=>{
    mockReducedMotion=false;mockNativeChatLayout=true;
    let height=1600;mockListApi.getChildContainerDimensions=()=>({width:390,height});
    await render();mockTailTiming.mockClear();
    height+=growth;props={...props,messages:[...props.messages,{...message(3,nextDate),kind} as HelpMessage]};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(require('../src/features/help/helpDiagnostics').helpDevEvent).toHaveBeenCalledWith('timeline.tailShift',expect.objectContaining({delta:growth,native:true}));
    expect(screen!.root.findAllByType(HelpMessageArrival).at(-1)!.props.distance).toBe(0);
    expect(mockTailTiming).toHaveBeenCalledTimes(1);
    // Media metadata can settle after upload/cache I/O, beyond the old 600 ms
    // text-key timer. Its geometry still belongs to the same whole-list path.
    await act(async()=>jest.advanceTimersByTimeAsync(1000));mockTailTiming.mockClear();
    height+=180;await act(async()=>mockFlashProps.onCommitLayoutEffect());
    expect(require('../src/features/help/helpDiagnostics').helpDevEvent).toHaveBeenLastCalledWith('timeline.tailShift',expect.objectContaining({delta:180,native:true}));
    expect(mockTailTiming).toHaveBeenCalledTimes(1);
  });
  test('incoming AI answer shares the measured stack motion without a nested arrival clock',async()=>{
    mockReducedMotion=false;mockNativeChatLayout=true;
    let height=1600;mockListApi.getChildContainerDimensions=()=>({width:390,height});
    props={...props,renderMessage:row=>row.text?React.createElement(HelpMessageArrival,{identity:`answer:${row.id}`,animate:true},React.createElement(View)):React.createElement(View)};
    await render();
    const timing=jest.spyOn(Animated,'timing');mockTailTiming.mockClear();
    try{
      height+=180;props={...props,messages:props.messages.map((row,index)=>index===1?{...row,text:'Ответ ИИ'}:row)};
      await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
      expect(mockTailTiming).toHaveBeenCalledTimes(1);
      expect(timing).not.toHaveBeenCalled();
      height+=44;await act(async()=>mockFlashProps.onCommitLayoutEffect());
      expect(mockTailTiming).toHaveBeenCalledTimes(2);
    }finally{timing.mockRestore();}
  });
  test('removing a superseded AI placeholder does not disable later streaming on the same message',async()=>{
    mockReducedMotion=false;mockNativeChatLayout=true;
    let height=1600;mockListApi.getChildContainerDimensions=()=>({width:390,height});
    await render();mockTailTiming.mockClear();
    height-=100;props={...props,messages:props.messages.slice(1)};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(mockTailTiming).toHaveBeenCalledTimes(1);
    height+=44;await act(async()=>mockFlashProps.onCommitLayoutEffect());
    expect(mockTailTiming).toHaveBeenCalledTimes(2);
    expect(require('../src/features/help/helpDiagnostics').helpDevEvent).toHaveBeenLastCalledWith('timeline.tailShift',expect.objectContaining({delta:44}));
  });
  test('unmeasured and temporarily unavailable FlashList geometry cannot break a layout commit',async()=>{
    mockReducedMotion=false;await render();
    const window=jest.fn(()=>{throw new Error('LayoutManager is not initialized');});
    mockListApi.getWindowSize=window;mockListApi.getLayout=()=>undefined;
    await act(async()=>mockFlashProps.onCommitLayoutEffect());
    expect(window).not.toHaveBeenCalled();
    mockListApi.getLayout=(index:number)=>mockLayouts[index];
    await act(async()=>mockFlashProps.onCommitLayoutEffect());
    expect(window).toHaveBeenCalledTimes(1);
  });
  test('inactive updates retain the geometry baseline without animating on return',async()=>{
    mockReducedMotion=false;mockNativeChatLayout=true;props={...props,bottomAligned:true};
    let height=300;mockListApi.getChildContainerDimensions=()=>({width:390,height});
    await render();mockTailTiming.mockClear();mockTailCancel.mockClear();
    height=360;props={...props,active:false,messages:[...props.messages,message(3,nextDate)]};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(mockTailTiming).not.toHaveBeenCalled();expect(mockTailCancel).toHaveBeenCalled();
    props={...props,active:true};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    height=400;props={...props,messages:[...props.messages,message(4,nextDate)]};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(require('../src/features/help/helpDiagnostics').helpDevEvent).toHaveBeenLastCalledWith('timeline.tailShift',expect.objectContaining({delta:40,native:true}));
  });
  test('manual drag and explicit positioning cancel presentation motion',async()=>{
    mockReducedMotion=false;await render();mockTailCancel.mockClear();
    await act(async()=>mockFlashProps.onScrollBeginDrag());
    expect(mockTailCancel).toHaveBeenCalledTimes(1);
    await act(async()=>ref.current!.scrollTo({y:200}));
    expect(mockTailCancel).toHaveBeenCalledTimes(2);
    await act(async()=>ref.current!.scrollToEnd());
    expect(mockTailCancel).toHaveBeenCalledTimes(3);
  });
  test('dock-owned latest control receives state without mounting a second timeline control',async()=>{
    const onLatestState=jest.fn();props={...props,onLatestState,unreadCount:3};await render();
    expect(onLatestState).toHaveBeenLastCalledWith({visible:false,count:3,loading:false});
    expect(screen!.root.findAllByType(require('../src/features/help/components/HelpTimelineIndicators').HelpJumpToLatest)).toHaveLength(0);
  });
  async function render(){
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpTimeline,{...props,ref}));});
    await act(async()=>mockFlashProps.onLayout({nativeEvent:{layout:{height:600}}}));
    await act(async()=>mockFlashProps.onLoad());
    await observe();
  }
  test('server receipt updates a stable list holder instead of moving a footer into the list',async()=>{
    const pending={key:'qa-cell',ticketId:7,create:false,createdAt:Date.parse(nextDate),status:'sending' as const,input:{text:'QA',clientMessageId:'qa-cell'}};
    props={...props,pendingMessages:[pending],renderPending:()=>React.createElement(View,{testID:'pending-cell'})};
    await render();
    const pendingRow=mockFlashProps.data.find((row:any)=>row.pending);
    const type=mockFlashProps.getItemType(pendingRow);
    const holder=screen!.root.findAllByType('TimelineRow' as any).at(-1);
    const accepted={...message(3,nextDate),clientMessageId:'qa-cell'};
    props={...props,pendingMessages:[],messages:[...props.messages,accepted]};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    const acceptedRow=mockFlashProps.data.find((row:any)=>row.message.id===3);
    expect(acceptedRow.key).toBe(pendingRow.key);
    expect(mockFlashProps.getItemType(acceptedRow)).toBe(type);
    expect(screen!.root.findAllByType('TimelineRow' as any).at(-1)).toBe(holder);
  });
  async function observe(){await act(async()=>mockFlashProps.onScroll({nativeEvent:{contentOffset:{x:0,y:0},layoutMeasurement:{width:390,height:600},contentSize:{width:390,height:1000}}}));}
  test('binding a created ticket retains native tail following without another scroll command',async()=>{
    mockNativeChatLayout=true;
    const nativeEnd=jest.fn();mockListApi.getNativeScrollRef=()=>({scrollToEnd:nativeEnd});
    await render();nativeEnd.mockClear();mockListApi.scrollToEnd.mockClear();
    props={...props,navigationTarget:{key:881,kind:'latest',animate:false}};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    await act(async()=>jest.advanceTimersByTimeAsync(100));
    expect(nativeEnd).not.toHaveBeenCalled();expect(mockListApi.scrollToEnd).not.toHaveBeenCalled();
    expect(props.onFollow).toHaveBeenLastCalledWith(true);
    // An actual history gesture still requires explicit positioning to Latest.
    await act(async()=>mockFlashProps.onScrollBeginDrag());
    props={...props,navigationTarget:{key:882,kind:'latest',animate:false}};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(nativeEnd).toHaveBeenCalled();
  });
  test('read visibility follows dock frame measurements without rerendering the timeline',async()=>{
    const obscuredBottom={current:60};props={...props,obscuredBottom};
    await render();
    // A growing composer covers the second message while the read debounce is pending.
    obscuredBottom.current=250;
    await act(async()=>jest.advanceTimersByTimeAsync(700));
    expect(props.onRead).toHaveBeenLastCalledWith(1);
    obscuredBottom.current=60;await observe();
    await act(async()=>jest.advanceTimersByTimeAsync(700));
    expect(props.onRead).toHaveBeenLastCalledWith(2);
  });
  test('first optimistic cell waits for settled tail geometry before playing its arrival',async()=>{
    props={...props,messages:[],bottomAligned:true,renderPending:()=>React.createElement(View)};
    await render();
    mockLayouts=[{y:400,height:44},{y:444,height:84,isHeightMeasured:false} as any];
    const pending={key:'qa-first-layout',ticketId:null,create:true,createdAt:Date.parse(nextDate),status:'sending' as const,input:{text:'QA',clientMessageId:'qa-first-layout'}};
    props={...props,pendingMessages:[pending]};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    const layer=()=>StyleSheet.flatten(screen!.root.findByProps({testID:'help-timeline-live-layer'}).props.style);
    expect(layer().opacity).toBe(0);
    expect(screen!.root.findByType(HelpMessageArrival).props.deferred).toBe(true);
    await act(async()=>jest.advanceTimersByTimeAsync(100));expect(layer().opacity).toBe(0);
    mockLayouts=[{y:400,height:44},{y:444,height:84}];
    await act(async()=>jest.advanceTimersByTimeAsync(100));
    expect(layer().opacity).toBe(1);
    expect(screen!.root.findByType(HelpMessageArrival).props.deferred).toBe(false);
  });
  test('missing first-cell measurements cannot keep a saved outgoing message invisible',async()=>{
    props={...props,messages:[],bottomAligned:true,renderPending:()=>React.createElement(View)};
    await render();mockLayouts=[];
    props={...props,pendingMessages:[{key:'qa-layout-timeout',ticketId:null,create:true,createdAt:Date.parse(nextDate),input:{text:'QA',clientMessageId:'qa-layout-timeout'}}]};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    await act(async()=>jest.advanceTimersByTimeAsync(700));
    expect(StyleSheet.flatten(screen!.root.findByProps({testID:'help-timeline-live-layer'}).props.style).opacity).toBe(1);
  });
  test('only a live appended tail is eligible for arrival, not initial history or edits',async()=>{
    await render();
    expect(screen!.root.findAllByType(HelpMessageArrival).every(row=>!row.props.animate)).toBe(true);
    props={...props,messages:[...props.messages,message(3)]};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(screen!.root.findAllByType(HelpMessageArrival).filter(row=>row.props.animate).map(row=>row.props.identity)).toEqual(['message:3']);
    props={...props,messages:props.messages.map(row=>row.id===3?{...row,text:'edit'}:row)};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(screen!.root.findAllByType(HelpMessageArrival).every(row=>!row.props.animate)).toBe(true);
  });
  test('arrival remains eligible after IME or dragging releases follow',async()=>{
    await render();await act(async()=>mockFlashProps.onScrollBeginDrag());
    props={...props,messages:[...props.messages,message(3)]};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(screen!.root.findAllByType(HelpMessageArrival).filter(row=>row.props.animate).map(row=>row.props.identity)).toEqual(['message:3']);
    await act(async()=>jest.advanceTimersByTimeAsync(700));
    props={...props,renderMessage:row=>React.createElement(View,{testID:'later-'+row.id})};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(screen!.root.findAllByType(HelpMessageArrival).every(row=>!row.props.animate)).toBe(true);
  });
  test('loaded newer history is not mistaken for a newly received message',async()=>{
    props={...props,hasNewer:true};await render();
    props={...props,hasNewer:false,messages:[...props.messages,message(3)]};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(screen!.root.findAllByType(HelpMessageArrival).every(row=>!row.props.animate)).toBe(true);
  });
  test('new conversation keeps an empty outbox at the bottom before its first server page',async()=>{
    props={...props,messages:[],bottomAligned:true,footer:React.createElement(View,{testID:'first-pending-message'})};
    await render();
    expect(mockFlashProps.maintainVisibleContentPosition.startRenderingFromBottom).toBe(true);
    expect(mockFlashProps.ListFooterComponentStyle).toMatchObject({flexGrow:1,justifyContent:'flex-end'});
    let scroller!:TestRenderer.ReactTestRenderer;
    await act(async()=>{scroller=TestRenderer.create(React.createElement(mockFlashProps.renderScrollComponent,{contentContainerStyle:{paddingTop:112}}));});
    expect(StyleSheet.flatten(scroller.root.findByType(require('react-native').ScrollView).props.contentContainerStyle)).toMatchObject({flexGrow:1,paddingTop:112});
    await act(async()=>scroller.unmount());
    props={...props,messages:[message(10)],navigationTarget:{key:111,kind:'latest'}};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(mockFlashProps.maintainVisibleContentPosition.startRenderingFromBottom).toBe(true);
  });
  test('a short complete conversation stays bottom aligned after reopening a saved non-tail anchor',async()=>{
    mockListApi.getChildContainerDimensions=()=>({width:390,height:150});
    props={...props,onReady:jest.fn(),navigationTarget:{key:120,kind:'anchor',messageId:2,sequence:2,offset:5},hasOlder:false,hasNewer:false};
    for(let attempt=0;attempt<2;attempt++){
      mockListApi.scrollToEnd.mockClear();mockListApi.scrollToOffset.mockClear();
      await render();await act(async()=>jest.advanceTimersByTimeAsync(100));
      expect(mockFlashProps.maintainVisibleContentPosition.startRenderingFromBottom).toBe(true);
      expect(mockListApi.scrollToEnd).toHaveBeenCalled();
      expect(mockListApi.scrollToOffset).not.toHaveBeenCalled();
      expect(props.onFollow).toHaveBeenLastCalledWith(true);
      await act(async()=>screen!.unmount());screen=undefined;
    }
  });
  function floating(){return screen!.root.findAllByType(HelpDateSeparator).find(node=>StyleSheet.flatten(node.parent?.props.style)?.position==='absolute');}
  test('a future day separator does not hide the current day and compact pill sits4px below capsule',async()=>{
    await render();const date=floating()!;
    expect(date.props.date).toBe(firstDate);expect(date.props.compact).toBe(true);
    const top=StyleSheet.flatten(date.parent!.props.style).top as number;
    expect(top).toBe(88);expect(top-(props.headerHeight-16)).toBe(4);
    expect(props.onStickyDateChange).toHaveBeenLastCalledWith(firstDate);
    await act(async()=>date.props.onPress());expect(props.onDate).toHaveBeenCalledWith(firstDate);
  });
  test('voice header growth moves the chip by the measured delta without changing its date',async()=>{
    await render();const initial=StyleSheet.flatten(floating()!.parent!.props.style).top as number;
    props={...props,headerHeight:144};await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));await observe();
    expect(StyleSheet.flatten(floating()!.parent!.props.style).top).toBe(initial+44);expect(floating()!.props.date).toBe(firstDate);
    expect(mockFlashProps.contentContainerStyle.paddingTop).toBe(156);
  });
  test('external overlay receives sticky date while internal rendering is hidden; handle jump uses it',async()=>{
    props.hideStickyDate=true;await render();
    expect(floating()).toBeUndefined();expect(props.onStickyDateChange).toHaveBeenLastCalledWith(firstDate);
    await act(async()=>ref.current!.jumpToDate());expect(props.onDate).toHaveBeenCalledWith(firstDate);
    // The next day's first row is already readable in this viewport.
    await act(async()=>ref.current!.jumpToDate(nextDate));expect(props.onDate).toHaveBeenCalledTimes(1);
    await act(async()=>screen!.unmount());screen=undefined;
    expect(props.onStickyDateChange).toHaveBeenLastCalledWith(null);
  });
  test('a visible separator for the same day hides its duplicate floating chip',async()=>{
    mockLayouts[0]={y:110,height:44};mockLayouts[1]={y:154,height:100};await render();
    expect(floating()).toBeUndefined();expect(props.onStickyDateChange).toHaveBeenLastCalledWith(null);
  });
  test.each([80,55,51])('partly clipped same-day pill at rowTop%s suppresses the duplicate despite read-visibility threshold',async rowTop=>{
    // At80 only24 of the44px touch row remain below headerHeight100; at51
    // just1px of the pill remains below the capsule bottom84. Both are visible.
    mockLayouts[0]={y:rowTop,height:44};await render();
    expect(floating()!.props.date).toBe(firstDate);
    expect(screen!.root.findAllByProps({testID:'help-inline-date-clip'})[0].props.style.opacity).toBe(0);
  });
  test('sticky date appears only after the inline pill fully clears the capsule boundary',async()=>{
    mockLayouts[0]={y:110,height:44};await render();expect(floating()).toBeUndefined();
    mockLayouts[0]={y:100,height:44};await observe();
    expect(floating()!.props.date).toBe(firstDate);expect(props.onStickyDateChange).toHaveBeenLastCalledWith(firstDate);
  });
  test('a partly clipped future-day pill cannot suppress the first visible message day',async()=>{
    // A following day can overlap the header during recycled layout estimates.
    // It still must not make the current day's external chip disappear.
    mockLayouts[2]={y:80,height:44};await render();
    expect(floating()!.props.date).toBe(firstDate);expect(props.onStickyDateChange).toHaveBeenLastCalledWith(firstDate);
  });
  test('text scrolling and sticky-date changes reuse retained message cells',async()=>{
    const renderMessage=jest.fn(props.renderMessage);props.renderMessage=renderMessage;
    await render();renderMessage.mockClear();
    const previous={renderItem:mockFlashProps.renderItem,keyExtractor:mockFlashProps.keyExtractor,getItemType:mockFlashProps.getItemType,extraData:mockFlashProps.extraData,maintainVisibleContentPosition:mockFlashProps.maintainVisibleContentPosition};
    mockListApi.computeVisibleIndices=()=>({startIndex:2,endIndex:3});
    mockLayouts[2]={y:40,height:44};mockLayouts[3]={y:90,height:100};
    await act(async()=>mockFlashProps.onScrollEndDrag());
    expect(floating()!.props.date).toBe(nextDate);
    expect(renderMessage).not.toHaveBeenCalled();
    for(const [key,value] of Object.entries(previous))expect(mockFlashProps[key]).toBe(value);
  });
  test('updated message presentation and callbacks still reach recycled cells',async()=>{
    await render();const previousRenderer=mockFlashProps.renderItem;const onPress=jest.fn();
    props={...props,renderMessage:row=>React.createElement(View,{testID:`selected-${row.id}`,accessibilityState:{selected:true},onTouchEnd:onPress})};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(mockFlashProps.renderItem).not.toBe(previousRenderer);
    const selected=screen!.root.findByProps({testID:'selected-1'});
    expect(selected.props.accessibilityState.selected).toBe(true);
    await act(async()=>selected.props.onTouchEnd());expect(onPress).toHaveBeenCalledTimes(1);
  });
  test.each(['attachment','reply'])('%s images retain viewport priorities without replacing the row renderer',async location=>{
    const image={id:'test-image',kind:'IMAGE'};
    props.messages=Array.from({length:12},(_,index)=>({...message(index+1,firstDate),...(location==='attachment'?{attachments:[image]}:{replyTo:{id:99,text:'',attachments:[image]}})})) as HelpMessage[];
    function MediaPriority({id}:{id:number}){const priority=React.useContext(HelpMediaLoadingContext);return React.createElement(View,{testID:`priority-${id}`,accessibilityLabel:priority});}
    props.renderMessage=row=>React.createElement(MediaPriority,{id:row.id});
    await render();const renderer=mockFlashProps.renderItem;
    expect(screen!.root.findByProps({testID:'priority-1'}).props.accessibilityLabel).toBe('visible');
    expect(screen!.root.findByProps({testID:'priority-7'}).props.accessibilityLabel).toBe('near');
    expect(screen!.root.findByProps({testID:'priority-10'}).props.accessibilityLabel).toBe('deferred');
    mockListApi.computeVisibleIndices=()=>({startIndex:9,endIndex:12});
    await act(async()=>mockFlashProps.onScrollEndDrag());
    expect(mockFlashProps.renderItem).toBe(renderer);
    expect(screen!.root.findByProps({testID:'priority-1'}).props.accessibilityLabel).toBe('deferred');
    expect(screen!.root.findByProps({testID:'priority-7'}).props.accessibilityLabel).toBe('near');
    expect(screen!.root.findByProps({testID:'priority-10'}).props.accessibilityLabel).toBe('visible');
  });
  const scrollEvent=(offset:number)=>({nativeEvent:{contentOffset:{x:0,y:offset},layoutMeasurement:{width:390,height:600},contentSize:{width:390,height:1000}}});
  test('opening a saved index needs one measured alignment, not an index preparation and stability loop',async()=>{
    props={...props,onReady:jest.fn(),navigationTarget:{key:91,kind:'anchor',messageId:2,sequence:2,offset:5,animate:false}};
    mockListApi.scrollToOffset.mockImplementation(({offset}:any)=>{mockListApi.getAbsoluteLastScrollOffset=()=>offset;});
    await render();
    expect(mockFlashProps.initialScrollIndex).toBe(3);
    await act(async()=>jest.advanceTimersByTimeAsync(80));
    expect(mockListApi.scrollToIndex).not.toHaveBeenCalled();
    expect(mockListApi.scrollToOffset).toHaveBeenLastCalledWith({offset:259,animated:false,skipFirstItemOffset:true});
    expect(props.onReady).toHaveBeenCalled();
  });
  test('initial positioning keeps estimates hidden and owns the anchor until measured rows stop changing',async()=>{
    props={...props,onReady:jest.fn(),navigationTarget:{key:92,kind:'anchor',messageId:2,sequence:2,offset:5,animate:false}};
    (mockLayouts[3] as any).isHeightMeasured=false;mockLayouts[3].height=0;
    mockListApi.scrollToOffset.mockImplementation(({offset}:any)=>{mockListApi.getAbsoluteLastScrollOffset=()=>offset;});
    await render();await act(async()=>jest.advanceTimersByTimeAsync(80));
    expect(props.onReady).not.toHaveBeenCalled();
    expect(mockFlashProps.maintainVisibleContentPosition.disabled).toBe(true);
    mockLayouts[3]={y:460,height:100,...{isHeightMeasured:true}};
    await act(async()=>{mockFlashProps.onCommitLayoutEffect();await jest.advanceTimersByTimeAsync(80);});
    expect(mockListApi.scrollToOffset).toHaveBeenLastCalledWith({offset:355,animated:false,skipFirstItemOffset:true});
    expect(props.onReady).toHaveBeenCalledTimes(1);
    expect(mockFlashProps.maintainVisibleContentPosition.disabled).toBe(false);
  });
  test('a fully measured short history opens when initial-index offset differs from native clamp',async()=>{
    props={...props,onReady:jest.fn(),navigationTarget:{key:95,kind:'anchor',messageId:2,sequence:2,offset:5,animate:false}};
    mockListApi.getAbsoluteLastScrollOffset=()=>80;
    await render();
    await act(async()=>{mockFlashProps.onContentSizeChange(390,470);await jest.advanceTimersByTimeAsync(80);});
    expect(mockListApi.scrollToOffset).toHaveBeenLastCalledWith({offset:0,animated:false,skipFirstItemOffset:true});
    expect(props.onReady).toHaveBeenCalledTimes(1);
  });
  test('a page arriving after the empty list loaded still uses measured initial positioning',async()=>{
    const messages=props.messages;props={...props,messages:[],loading:true,onReady:jest.fn(),navigationTarget:null};
    mockListApi.scrollToOffset.mockImplementation(({offset}:any)=>{mockListApi.getAbsoluteLastScrollOffset=()=>offset;});
    await render();expect(props.onReady).not.toHaveBeenCalled();
    props={...props,messages,loading:false,navigationTarget:{key:94,kind:'anchor',messageId:2,sequence:2,offset:5,animate:false}};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    await act(async()=>jest.advanceTimersByTimeAsync(80));
    expect(mockListApi.scrollToIndex).not.toHaveBeenCalled();
    expect(mockListApi.scrollToOffset).toHaveBeenLastCalledWith({offset:259,animated:false,skipFirstItemOffset:true});
    expect(props.onReady).toHaveBeenCalledTimes(1);
  });
  test('late history brings an unmeasured saved cell into the rendered window',async()=>{
    const messages=props.messages;props={...props,messages:[],loading:true,onReady:jest.fn(),navigationTarget:null};
    await render();
    (mockLayouts[3] as any).isHeightMeasured=false;
    mockListApi.scrollToIndex.mockImplementation(async()=>{mockLayouts[3]={y:364,height:100,...{isHeightMeasured:true}};});
    mockListApi.scrollToOffset.mockImplementation(({offset}:any)=>{mockListApi.getAbsoluteLastScrollOffset=()=>offset;});
    props={...props,messages,loading:false,navigationTarget:{key:96,kind:'anchor',messageId:2,sequence:2,offset:5}};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    await act(async()=>jest.advanceTimersByTimeAsync(100));
    expect(mockListApi.scrollToIndex).toHaveBeenCalledTimes(1);
    expect(mockListApi.scrollToIndex).toHaveBeenCalledWith({index:3,animated:false,viewOffset:-105});
    expect(props.onReady).toHaveBeenCalledTimes(1);
  });
  test('a measured empty row cannot prevent the rest of the history opening',async()=>{
    mockLayouts[2]={y:320,height:0,...{isHeightMeasured:true}};
    props={...props,onReady:jest.fn(),navigationTarget:{key:97,kind:'anchor',messageId:2,sequence:2,offset:5}};
    mockListApi.scrollToOffset.mockImplementation(({offset}:any)=>{mockListApi.getAbsoluteLastScrollOffset=()=>offset;});
    await render();await act(async()=>jest.advanceTimersByTimeAsync(100));expect(props.onReady).toHaveBeenCalledTimes(1);
  });
  test('a stable measured long page opens even if native scrolling clamps its cached offset',async()=>{
    props={...props,onReady:jest.fn(),navigationTarget:{key:98,kind:'anchor',messageId:2,sequence:2,offset:5}};
    mockListApi.getAbsoluteLastScrollOffset=()=>80;
    await render();await act(async()=>{mockFlashProps.onContentSizeChange(390,2000);await jest.advanceTimersByTimeAsync(250);});
    expect(props.onReady).toHaveBeenCalledTimes(1);
    expect(mockListApi.scrollToOffset).toHaveBeenCalledWith({offset:259,animated:false,skipFirstItemOffset:true});
  });
  test('opening a measured live answer hands the growing tail to follow without waiting for the answer to finish',async()=>{
    let content=1000,offset=0;
    props={...props,messages:props.messages.map((message,index)=>index===1?{...message,assistantRun:{status:'streaming'} as any}:message),onReady:jest.fn(),navigationTarget:{key:93,kind:'latest',animate:false}};
    mockListApi.getAbsoluteLastScrollOffset=()=>offset;mockListApi.scrollToEnd.mockImplementation(()=>{offset=content-600;});
    await render();
    const stream=setInterval(()=>{content+=2;mockLayouts[3].height+=2;mockFlashProps.onContentSizeChange(390,content);},8);
    await act(async()=>jest.advanceTimersByTimeAsync(80));clearInterval(stream);
    expect(props.onReady).toHaveBeenCalledTimes(1);expect(props.onFollow).toHaveBeenLastCalledWith(true);
    expect(props.messages[1].assistantRun?.status).toBe('streaming');
  });
  test('an 8dp user scroll and programmatic positioning keep the latest arrow hidden',async()=>{
    await render();
    await act(async()=>mockFlashProps.onScroll(scrollEvent(400)));
    const arrow=()=>screen!.root.findAll(node=>typeof node.props.visible==='boolean'&&typeof node.props.onPress==='function')[0];
    expect(arrow().props.visible).toBe(false);
    await act(async()=>mockFlashProps.onScrollBeginDrag());
    await act(async()=>mockFlashProps.onScroll(scrollEvent(392)));
    expect(arrow().props.visible).toBe(false);
    await act(async()=>mockFlashProps.onScroll(scrollEvent(272)));
    expect(arrow().props.visible).toBe(true);
  });
  test('date preparation leaves the original on screen and resolves only after the old viewport is painted',async()=>{
    mockReducedMotion=false;await render();
    await act(async()=>ref.current!.jumpToDate(firstDate));
    expect(StyleSheet.flatten(screen!.root.findAllByProps({testID:'help-timeline-live-layer'})[0].props.style).opacity).toBe(1);
    expect(StyleSheet.flatten(screen!.root.findAllByProps({testID:'help-timeline-preparation'})[0].props.style).opacity).toBe(0);
    let prepared=false;
    const waiting=ref.current!.waitForJumpReady().then(value=>{prepared=value;});
    expect(prepared).toBe(false);
    await act(async()=>jest.advanceTimersByTimeAsync(70));
    await waiting;
    expect(prepared).toBe(true);
    expect(StyleSheet.flatten(screen!.root.findAllByProps({testID:'help-timeline-transition'})[0].props.style).opacity).toBe(1);
  });
  test('latest retains a nearby viewport until ready, blocks repeat taps and animates both fragments once',async()=>{
    mockReducedMotion=false;await render();
    const timing=jest.spyOn(require('react-native').Animated,'timing');
    try{
      let accepted=false;
      await act(async()=>{accepted=ref.current!.prepareJump();});
      expect(accepted).toBe(true);expect(ref.current!.prepareJump()).toBe(false);
      const live=()=>StyleSheet.flatten(screen!.root.findAllByProps({testID:'help-timeline-live-layer'})[0].props.style);
      expect(live().transform[0].translateY.__getValue()).toBe(0);
      const waiting=ref.current!.waitForJumpReady();
      await act(async()=>jest.advanceTimersByTimeAsync(70));expect(await waiting).toBe(true);
      props={...props,navigationTarget:{kind:'latest',key:902,animate:true}};
      mockListApi.scrollToEnd.mockClear();
      await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
      expect(ref.current!.prepareJump()).toBe(false);
      await act(async()=>jest.advanceTimersByTimeAsync(70));
      expect(timing.mock.calls.filter(([,config]:any)=>config.duration===600)).toHaveLength(1);
      const positions=mockListApi.scrollToEnd.mock.calls.length;
      await act(async()=>jest.advanceTimersByTimeAsync(700));
      expect(mockListApi.scrollToEnd.mock.calls.length).toBe(positions);
      expect(screen!.root.findAllByProps({testID:'help-timeline-transition'})).toHaveLength(0);
      expect(props.onFollow).toHaveBeenLastCalledWith(true);
    }finally{timing.mockRestore();}
  });
  test('touching the old viewport cancels a still-preparing date jump',async()=>{
    mockReducedMotion=false;await render();
    await act(async()=>ref.current!.jumpToDate(firstDate));
    const waiting=ref.current!.waitForJumpReady();
    await act(async()=>mockFlashProps.onScrollBeginDrag());
    expect(await waiting).toBe(false);
  });
  test('a date transition retains the same image cache and never gives its copy a download priority',async()=>{
    const {HelpImageCacheContext,HelpMediaLoadingContext}=require('../src/features/help/helpMediaLoading');
    const seen:{priority:string;cache:unknown}[]=[];
    const ImageProbe=()=>{const priority=React.useContext(HelpMediaLoadingContext) as string,cache=React.useContext(HelpImageCacheContext);seen.push({priority,cache});return React.createElement(View);};
    mockReducedMotion=false;props={...props,renderMessage:()=>React.createElement(ImageProbe)};
    await render();const cache=seen[0].cache;
    await act(async()=>ref.current!.jumpToDate(firstDate));
    const retained=seen.filter(value=>value.priority==='retained');
    expect(cache).toBeTruthy();expect(retained.length).toBeGreaterThan(0);
    expect(retained.every(value=>value.cache===cache)).toBe(true);
  });
  test('leaving the tail by 8px never reacquires follow inside the old 64px threshold',async()=>{
    await render();await act(async()=>ref.current!.scrollToEnd());
    expect(props.onFollow).toHaveBeenLastCalledWith(true);
    await act(async()=>mockFlashProps.onScroll(scrollEvent(400)));
    await act(async()=>mockFlashProps.onScrollBeginDrag());
    await act(async()=>mockFlashProps.onScroll(scrollEvent(392)));
    expect(props.onFollow).toHaveBeenLastCalledWith(false);
    expect(mockFlashProps.maintainVisibleContentPosition.disabled).toBe(false);
    await act(async()=>mockFlashProps.onScrollEndDrag());
    await act(async()=>jest.advanceTimersByTimeAsync(220));
    expect(props.onFollow).toHaveBeenLastCalledWith(false);
  });
  test('deferred cache trimming waits for drag and momentum to finish',async()=>{
    await render();(props.onSave as jest.Mock).mockClear();
    await act(async()=>mockFlashProps.onScrollBeginDrag());
    await act(async()=>mockFlashProps.onScroll(scrollEvent(392)));
    await act(async()=>jest.advanceTimersByTimeAsync(500));
    expect(props.onSave).not.toHaveBeenCalled();
    await act(async()=>mockFlashProps.onScrollEndDrag());
    await act(async()=>mockFlashProps.onMomentumScrollBegin());
    await act(async()=>jest.advanceTimersByTimeAsync(500));
    expect(props.onSave).not.toHaveBeenCalled();
    await act(async()=>mockFlashProps.onMomentumScrollEnd());
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });
  test('only the settled physical end reacquires follow',async()=>{
    await render();await act(async()=>mockFlashProps.onScrollBeginDrag());
    await act(async()=>mockFlashProps.onScroll(scrollEvent(399)));
    await act(async()=>mockFlashProps.onScrollEndDrag());
    expect(props.onFollow).not.toHaveBeenLastCalledWith(true);
    await act(async()=>jest.advanceTimersByTimeAsync(220));
    expect(props.onFollow).toHaveBeenLastCalledWith(true);
  });
  test('programmatic scroll momentum cannot steal native follow ownership',async()=>{
    await render();await act(async()=>ref.current!.scrollToEnd());
    (props.onFollow as jest.Mock).mockClear();
    await act(async()=>mockFlashProps.onMomentumScrollBegin());
    expect(props.onFollow).not.toHaveBeenCalled();
    await act(async()=>mockFlashProps.onMomentumScrollEnd());
    expect(props.onFollow).not.toHaveBeenCalled();
    expect(mockFlashProps.maintainVisibleContentPosition.disabled).toBe(true);
  });
  test('leaving during a fling persists the anchor without asking the service to trim',async()=>{
    await render();(props.onSave as jest.Mock).mockClear();
    await act(async()=>mockFlashProps.onScrollBeginDrag());
    await act(async()=>mockFlashProps.onScroll(scrollEvent(200)));
    await act(async()=>mockFlashProps.onScrollEndDrag());
    await act(async()=>mockFlashProps.onMomentumScrollBegin());
    await act(async()=>ref.current!.save());
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({messageId:1}),{deferTrim:true});
  });
  test('date target whose beginning is already visible does not scroll or highlight',async()=>{
    mockReducedMotion=false;
    mockLayouts[1]={y:120,height:100};await render();
    mockListApi.scrollToIndex.mockClear();mockListApi.scrollToOffset.mockClear();
    await act(async()=>ref.current!.jumpToDate(firstDate));
    expect(props.onDate).not.toHaveBeenCalled();expect(props.onSave).not.toHaveBeenCalled();
    expect(screen!.root.findAllByProps({testID:'help-timeline-transition'})).toHaveLength(0);
    props={...props,navigationTarget:{key:1,kind:'date',messageId:1,sequence:1,animate:true}};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(mockListApi.scrollToIndex).not.toHaveBeenCalled();
    expect(mockListApi.scrollToOffset).not.toHaveBeenCalled();expect(props.onHighlight).not.toHaveBeenCalled();
    expect(screen!.root.findAllByProps({testID:'help-timeline-transition'})).toHaveLength(0);
  });
  test('near date uses one measured offset without index preparation or highlight',async()=>{
    await render();mockListApi.scrollToIndex.mockClear();mockListApi.scrollToOffset.mockClear();
    await act(async()=>ref.current!.jumpToDate(firstDate));
    props={...props,navigationTarget:{key:2,kind:'date',messageId:1,sequence:1,animate:true}};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(mockListApi.scrollToIndex).not.toHaveBeenCalled();
    expect(mockListApi.scrollToOffset).toHaveBeenCalledTimes(1);
    expect(mockListApi.scrollToOffset).toHaveBeenCalledWith({offset:0,animated:false,skipFirstItemOffset:true});
    expect(props.onHighlight).not.toHaveBeenCalled();
  });
  test('near date with motion enabled uses a single smooth scroll, never a page transition',async()=>{
    mockReducedMotion=false;await render();mockListApi.scrollToIndex.mockClear();mockListApi.scrollToOffset.mockClear();
    await act(async()=>ref.current!.jumpToDate(firstDate));
    props={...props,navigationTarget:{key:3,kind:'date',messageId:1,sequence:1,animate:true}};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(mockFlashProps.maintainVisibleContentPosition.disabled).toBe(true);
    await act(async()=>jest.advanceTimersByTimeAsync(320));
    expect(mockListApi.scrollToIndex).not.toHaveBeenCalled();expect(mockListApi.scrollToOffset).toHaveBeenCalledTimes(1);
    expect(mockListApi.scrollToOffset).toHaveBeenCalledWith({offset:0,animated:true,skipFirstItemOffset:true});
    expect(screen!.root.findAllByProps({testID:'help-timeline-transition'})).toHaveLength(0);expect(props.onHighlight).not.toHaveBeenCalled();
  });
  test('a visible date cancels a previous in-flight nearby navigation',async()=>{
    mockReducedMotion=false;await render();mockListApi.scrollToOffset.mockClear();
    props={...props,navigationTarget:{key:4,kind:'date',messageId:1,sequence:1,animate:true}};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(mockFlashProps.maintainVisibleContentPosition.disabled).toBe(true);
    await act(async()=>ref.current!.jumpToDate(nextDate));
    expect(props.onDate).not.toHaveBeenCalled();
    expect(mockFlashProps.maintainVisibleContentPosition.disabled).toBe(false);
    await act(async()=>jest.advanceTimersByTimeAsync(400));
    expect(mockListApi.scrollToOffset).toHaveBeenCalledTimes(1);expect(props.onHighlight).not.toHaveBeenCalled();
  });
});
