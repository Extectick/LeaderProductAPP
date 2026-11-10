import React from 'react';
import Renderer,{act} from 'react-test-renderer';
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:'light'})}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
import {useAppListPanelState,type AppListLoadState,type AppListBindings} from '../components/ui/AppListPanelState';
let tree:Renderer.ReactTestRenderer,state:AppListLoadState,active=true,bindings:AppListBindings;
function Harness(){bindings=useAppListPanelState(state,active,{paddingTop:120,paddingBottom:72});return React.createElement(React.Fragment,null,state.itemCount?bindings.footerState:bindings.emptyState);}
const render=async()=>{await act(async()=>{if(tree)tree.update(React.createElement(Harness));else tree=Renderer.create(React.createElement(Harness));});};
const deferred=()=>{let resolve!:(value?:unknown)=>void,reject!:(reason:unknown)=>void;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const button=(label:string)=>tree.root.findAll(node=>node.props.accessibilityLabel===label&&node.props.onPress)[0];
beforeEach(()=>{state={scope:'a',itemCount:30,loading:false,hasMore:true,onLoadMore:jest.fn()};active=true;});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=undefined as any;});

test('overlapping near-end events make one request and cannot loop on an unchanged page',async()=>{
 const request=deferred();state.onLoadMore=jest.fn(()=>request.promise);await render();
 await act(async()=>{bindings.onEndReached();bindings.onEndReached();bindings.onEndReached();});
 expect(state.onLoadMore).toHaveBeenCalledTimes(1);expect(tree.root.findByProps({testID:'app-list-loading-more'})).toBeDefined();
 await act(async()=>request.resolve());await act(async()=>bindings.onEndReached());expect(state.onLoadMore).toHaveBeenCalledTimes(1);
 state={...state,itemCount:60};await render();await act(async()=>bindings.onEndReached());expect(state.onLoadMore).toHaveBeenCalledTimes(2);
});
test('stale handlers and late rejection cannot affect a new query, even after A→B→A',async()=>{
 const request=deferred();state.onLoadMore=jest.fn(()=>request.promise);await render();const old=bindings.onEndReached;
 await act(async()=>old());state={...state,scope:'b',itemCount:0,query:'other'};await render();await act(async()=>old());
 state={...state,scope:'a',itemCount:30,onLoadMore:jest.fn()};await render();await act(async()=>{request.reject(new Error('old'));old();});
 expect(state.onLoadMore).not.toHaveBeenCalled();expect(tree.root.findAllByProps({testID:'app-list-error'})).toHaveLength(0);
 await act(async()=>bindings.onEndReached());expect(state.onLoadMore).toHaveBeenCalledTimes(1);
});
test('loading, hidden panels, locks, errors and exhausted results suppress automatic fetch',async()=>{
 const load=state.onLoadMore;
 for(const update of [{loading:true},{disabled:true},{error:'Сеть'},{hasMore:false}]){
  state={scope:JSON.stringify(update),itemCount:30,loading:false,hasMore:true,onLoadMore:load,...update};await render();await act(async()=>bindings.onEndReached());
 }
 state={scope:'inactive',itemCount:30,loading:false,hasMore:true,onLoadMore:load};active=false;await render();await act(async()=>bindings.onEndReached());
 expect(load).not.toHaveBeenCalled();
});
test('initial skeleton, retry error and no-results clear action are distinct',async()=>{
 const retry=jest.fn(),clear=jest.fn();state={...state,itemCount:0,loading:true,query:'test',onRetry:retry,onClear:clear};await render();
 expect(tree.root.findByProps({testID:'app-list-loading'})).toBeDefined();expect(tree.root.findAllByProps({testID:'app-list-empty'})).toHaveLength(0);
 state={...state,loading:false,error:'Нет связи'};await render();expect(tree.root.findByProps({testID:'app-list-error'})).toBeDefined();await act(async()=>button('Повторить загрузку').props.onPress());expect(retry).toHaveBeenCalledTimes(1);
 state={...state,error:null};await render();expect(tree.root.findByProps({testID:'app-list-empty'})).toBeDefined();await act(async()=>button('Очистить поиск').props.onPress());expect(clear).toHaveBeenCalledTimes(1);
});
test('ordinary scroll view uses shared viewport/content geometry for prefetch',async()=>{
 await render();await act(async()=>{bindings.onLayout({nativeEvent:{layout:{height:600}}} as any);bindings.onContentSizeChange(320,2000);});
 expect(state.onLoadMore).not.toHaveBeenCalled();
 await act(async()=>bindings.onScroll({nativeEvent:{layoutMeasurement:{height:600},contentSize:{height:2000},contentOffset:{y:1300}}} as any));
 expect(state.onLoadMore).toHaveBeenCalledTimes(1);
});
test('rejected page shows an explicit retry instead of silently triggering another page',async()=>{
 state.onLoadMore=jest.fn().mockRejectedValue(new Error('offline'));state.onRetry=jest.fn();await render();await act(async()=>bindings.onEndReached());
 expect(tree.root.findByProps({testID:'app-list-error'})).toBeDefined();await act(async()=>bindings.onEndReached());expect(state.onLoadMore).toHaveBeenCalledTimes(1);
 await act(async()=>button('Повторить загрузку').props.onPress());expect(state.onRetry).toHaveBeenCalledTimes(1);
});

test('real rows cannot inherit short skeleton geometry and prematurely fetch page two',async()=>{
 state={...state,itemCount:0,loading:true};await render();
 await act(async()=>{bindings.onLayout({nativeEvent:{layout:{height:900}}} as any);bindings.onContentSizeChange(320,540);});
 const staleMeasure=bindings.onContentSizeChange;
 state={...state,itemCount:30,loading:false};await render();
 expect(state.onLoadMore).not.toHaveBeenCalled();
 await act(async()=>staleMeasure(320,540));expect(state.onLoadMore).not.toHaveBeenCalled();
 await act(async()=>bindings.onContentSizeChange(320,2472));expect(state.onLoadMore).not.toHaveBeenCalled();
 await act(async()=>bindings.onScroll({nativeEvent:{layoutMeasurement:{height:900},contentSize:{height:2472},contentOffset:{y:1500}}} as any));
 expect(state.onLoadMore).toHaveBeenCalledTimes(1);
});

test('fresh short-list measurement still fills the viewport once without an unchanged-page loop',async()=>{
 state={...state,itemCount:0,loading:true};await render();
 await act(async()=>{bindings.onLayout({nativeEvent:{layout:{height:900}}} as any);bindings.onContentSizeChange(320,540);});
 state={...state,itemCount:3,loading:false};await render();expect(state.onLoadMore).not.toHaveBeenCalled();
 await act(async()=>bindings.onContentSizeChange(320,420));expect(state.onLoadMore).toHaveBeenCalledTimes(1);
 await act(async()=>{bindings.onContentSizeChange(320,420);bindings.onLayout({nativeEvent:{layout:{height:900}}} as any);});
 expect(state.onLoadMore).toHaveBeenCalledTimes(1);
});

 test('configurable prefetch starts before the last screen while defaults remain unchanged',async()=>{
  await render();
  const scroll={nativeEvent:{layoutMeasurement:{height:800},contentSize:{height:3200},contentOffset:{y:1600}}} as any;
  await act(async()=>bindings.onScroll(scroll));
  expect(state.onLoadMore).not.toHaveBeenCalled();
  state={...state,prefetchScreens:1.5};await render();
  await act(async()=>{bindings.onScroll(scroll);bindings.onScroll(scroll);});
  expect(state.onLoadMore).toHaveBeenCalledTimes(1);
 });
