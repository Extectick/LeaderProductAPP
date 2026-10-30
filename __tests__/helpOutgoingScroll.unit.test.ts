import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {View} from 'react-native';
import type {HelpMessage} from '../src/features/help/helpApi';
let mockProps:any;
const mockApi:any={};
jest.mock('@shopify/flash-list',()=>{
  const React=require('react');
  return {FlashList:React.forwardRef((props:any,ref:any)=>{mockProps=props;React.useImperativeHandle(ref,()=>mockApi);return React.createElement('FlashList',props);})};
});
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpReducedMotion:()=>false,useHelpTheme:()=>({background:'#151B22',panel:'#1E2730',muted:'#A6B0BE',accentText:'#68B0FF'})}));
jest.mock('../src/features/help/helpDiagnostics',()=>({helpDevActions:()=>()=>{},helpDevProbe:()=>()=>{},helpDevState:jest.fn()}));
jest.mock('../src/features/help/components/HelpNativeChatLayout',()=>({hasNativeChatLayout:false}));
import {HelpTimeline,type HelpTimelineHandle} from '../src/features/help/components/HelpTimeline';
import {HelpJumpToLatest} from '../src/features/help/components/HelpTimelineIndicators';

const message=(id:number)=>({id,sequence:id,ticketId:1043,createdAt:'2026-10-30T10:00:00Z',text:`Сообщение ${id}`,attachments:[]}) as HelpMessage;
describe('outgoing-message bottom anchor',()=>{
  let view:TestRenderer.ReactTestRenderer,ref:React.RefObject<HelpTimelineHandle|null>,props:React.ComponentProps<typeof HelpTimeline>;
  beforeEach(async()=>{
    jest.useFakeTimers();ref=React.createRef<HelpTimelineHandle>();
    Object.assign(mockApi,{computeVisibleIndices:()=>({startIndex:0,endIndex:2}),getFirstItemOffset:()=>0,getAbsoluteLastScrollOffset:()=>0,getLayout:(i:number)=>({y:i*100,height:100}),getNativeScrollRef:()=>null,scrollToEnd:jest.fn(),scrollToIndex:jest.fn().mockResolvedValue(undefined),scrollToOffset:jest.fn()});
    props={messages:[message(1),message(2)],nativeID:'outgoing-scroll',headerHeight:100,dockHeight:60,online:true,active:true,navigationTarget:{key:1,kind:'latest',animate:true},loadOlder:jest.fn(),loadNewer:jest.fn(),onLatest:jest.fn(),onDate:jest.fn(),onSave:jest.fn(),onRead:jest.fn(),onFollow:jest.fn(),onHighlight:jest.fn(),onError:jest.fn(),renderMessage:()=>React.createElement(View)};
    await act(async()=>{view=TestRenderer.create(React.createElement(HelpTimeline,{...props,ref}));});
    await act(async()=>{mockProps.onLayout({nativeEvent:{layout:{height:600}}});mockProps.onLoad();});
  });
  afterEach(async()=>{await act(async()=>view.unmount());jest.clearAllTimers();jest.useRealTimers();});
  const scroll=(offset:number,content:number)=>mockProps.onScroll({nativeEvent:{contentOffset:{x:0,y:offset},layoutMeasurement:{width:390,height:600},contentSize:{width:390,height:content}}});
  const arrows=()=>view.root.findAllByType(HelpJumpToLatest);
  test('sending at the tail never aligns the last cell to its top or flashes a down arrow during layout',async()=>{
    expect(mockApi.scrollToIndex).not.toHaveBeenCalled();
    expect(arrows()).toHaveLength(0);
    await act(async()=>scroll(400,1000));
    props={...props,messages:[...props.messages,message(3)]};
    await act(async()=>view.update(React.createElement(HelpTimeline,{...props,ref})));
    await act(async()=>{ref.current!.scrollToEnd({animated:false});scroll(400,1300);jest.advanceTimersByTime(500);});
    expect(arrows()).toHaveLength(0);
    expect(props.onFollow).not.toHaveBeenCalledWith(false);
    expect(mockApi.scrollToIndex).not.toHaveBeenCalled();
    expect(mockApi.scrollToEnd).toHaveBeenCalledWith({animated:false});
  });
  test('the arrow still appears for an actual history gesture and disappears on an explicit send anchor',async()=>{
    await act(async()=>{scroll(400,1000);mockProps.onScrollBeginDrag();scroll(150,1000);mockProps.onScrollEndDrag();jest.advanceTimersByTime(500);});
    expect(arrows()).toHaveLength(1);
    expect(props.onFollow).toHaveBeenLastCalledWith(false);
    await act(async()=>ref.current!.scrollToEnd({animated:false}));
    expect(arrows()).toHaveLength(0);
    expect(props.onFollow).toHaveBeenLastCalledWith(true);
    expect(mockApi.scrollToIndex).not.toHaveBeenCalled();
  });
});
