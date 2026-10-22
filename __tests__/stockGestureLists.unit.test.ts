import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {StockFlatList,StockRefreshControl,StockSwipeRefContext} from '../src/features/stockBalances/StockGestureLists';
jest.mock('react-native-gesture-handler',()=>({FlatList:'GestureList',RefreshControl:'GestureRefresh'}));
it('makes both native scrolling and refresh wait for the same horizontal gesture',()=>{
  const ref=React.createRef<any>();let view!:TestRenderer.ReactTestRenderer;
  const refresh=jest.fn();
  act(()=>{view=TestRenderer.create(React.createElement(StockSwipeRefContext.Provider,{value:ref},
    React.createElement(StockFlatList,{data:[],renderItem:()=>null}),
    React.createElement(StockRefreshControl,{refreshing:false,onRefresh:refresh})
  ));});
  expect(view.root.findByType('GestureList' as any).props.waitFor).toEqual([ref]);
  const control=view.root.findByType('GestureRefresh' as any);
  expect(control.props.waitFor).toEqual([ref]);
  act(()=>control.props.onRefresh());expect(refresh).toHaveBeenCalledTimes(1);
  act(()=>view.unmount());
});
