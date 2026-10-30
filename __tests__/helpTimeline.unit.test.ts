import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {StyleSheet,View} from 'react-native';
import { helpIsAtLatest, helpTimelineRows, helpVisibleRows } from '../src/features/help/helpTimelineModel';
import type { HelpMessage } from '../src/features/help/helpApi';
let mockFlashProps:any;
let mockReducedMotion=true;
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
jest.mock('../src/features/help/components/HelpNativeChatLayout',()=>({hasNativeChatLayout:false}));
import {HelpTimeline,type HelpTimelineHandle} from '../src/features/help/components/HelpTimeline';
import {HelpDateSeparator} from '../src/features/help/components/HelpTimelineIndicators';
import {HelpMediaLoadingContext} from '../src/features/help/helpMediaLoading';

const message=(sequence:number,date='2026-10-28T12:00:00Z')=>({id:sequence,sequence,createdAt:date}) as HelpMessage;
describe('messenger viewport and read boundaries',()=>{
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

describe('sticky date geometry and navigation integration',()=>{
  let screen:TestRenderer.ReactTestRenderer|undefined;
  let props:React.ComponentProps<typeof HelpTimeline>;
  let ref:React.RefObject<HelpTimelineHandle|null>;
  const firstDate='2026-10-27T12:00:00Z',nextDate='2026-10-28T12:00:00Z';
  beforeEach(()=>{
    jest.useFakeTimers();
    mockReducedMotion=true;
    mockFlashProps=undefined;
    // The first day's separator has already passed the header. The next day's
    // separator is visible lower in the list and must not hide the current day.
    mockLayouts=[{y:40,height:44},{y:90,height:100},{y:320,height:44},{y:364,height:100}];
    Object.assign(mockListApi,{computeVisibleIndices:()=>({startIndex:0,endIndex:3}),getFirstItemOffset:()=>0,getAbsoluteLastScrollOffset:()=>0,getLayout:(index:number)=>mockLayouts[index],scrollToEnd:jest.fn(),scrollToIndex:jest.fn().mockResolvedValue(undefined),scrollToOffset:jest.fn(),getNativeScrollRef:()=>null});
    props={messages:[message(1,firstDate),message(2,nextDate)],nativeID:'timeline-test',headerHeight:100,dockHeight:60,online:true,active:true,
      loadOlder:jest.fn().mockResolvedValue(undefined),loadNewer:jest.fn().mockResolvedValue(undefined),onLatest:jest.fn().mockResolvedValue(undefined),onDate:jest.fn().mockResolvedValue(undefined),onSave:jest.fn(),onRead:jest.fn(),onFollow:jest.fn(),onHighlight:jest.fn(),onError:jest.fn(),onStickyDateChange:jest.fn(),renderMessage:row=>React.createElement(View,{testID:`message-${row.id}`})};
    ref=React.createRef<HelpTimelineHandle>();
  });
  afterEach(async()=>{if(screen)await act(async()=>screen!.unmount());screen=undefined;jest.clearAllTimers();jest.useRealTimers();});
  async function render(){
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpTimeline,{...props,ref}));});
    await act(async()=>mockFlashProps.onLayout({nativeEvent:{layout:{height:600}}}));
    await act(async()=>mockFlashProps.onLoad());
    await observe();
  }
  async function observe(){await act(async()=>mockFlashProps.onScroll({nativeEvent:{contentOffset:{x:0,y:0},layoutMeasurement:{width:390,height:600},contentSize:{width:390,height:1000}}}));}
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
    await act(async()=>ref.current!.jumpToDate(nextDate));expect(props.onDate).toHaveBeenLastCalledWith(nextDate);
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
    expect(floating()).toBeUndefined();expect(props.onStickyDateChange).toHaveBeenLastCalledWith(null);
  });
  test('sticky date appears only after the inline pill fully clears the capsule boundary',async()=>{
    mockLayouts[0]={y:51,height:44};await render();expect(floating()).toBeUndefined();
    mockLayouts[0]={y:50,height:44};await observe();
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
    await render();
    expect(mockFlashProps.initialScrollIndex).toBe(3);
    await act(async()=>jest.advanceTimersByTimeAsync(20));
    expect(mockListApi.scrollToIndex).not.toHaveBeenCalled();
    expect(mockListApi.scrollToOffset).toHaveBeenLastCalledWith({offset:259,animated:false,skipFirstItemOffset:true});
    expect(props.onReady).toHaveBeenCalled();
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
  test('touching the old viewport cancels a still-preparing date jump',async()=>{
    mockReducedMotion=false;await render();
    await act(async()=>ref.current!.jumpToDate(firstDate));
    const waiting=ref.current!.waitForJumpReady();
    await act(async()=>mockFlashProps.onScrollBeginDrag());
    expect(await waiting).toBe(false);
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
    props={...props,navigationTarget:{key:5,kind:'date',messageId:2,sequence:2,animate:true}};
    await act(async()=>screen!.update(React.createElement(HelpTimeline,{...props,ref})));
    expect(mockFlashProps.maintainVisibleContentPosition.disabled).toBe(false);
    await act(async()=>jest.advanceTimersByTimeAsync(400));
    expect(mockListApi.scrollToOffset).toHaveBeenCalledTimes(1);expect(props.onHighlight).not.toHaveBeenCalled();
  });
});
