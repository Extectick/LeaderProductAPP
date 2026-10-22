import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {StockTabsPager} from '../src/features/stockBalances/StockTabsPager';
import {Gesture} from 'react-native-gesture-handler';
const mockSetPage=jest.fn(),mockSetPageWithoutAnimation=jest.fn();
jest.mock('../src/features/clientOrders/ClientOrdersPager',()=>({__esModule:true,default:require('react').forwardRef((props:any,ref:any)=>{
  require('react').useImperativeHandle(ref,()=>({setPage:mockSetPage,setPageWithoutAnimation:mockSetPageWithoutAnimation}));
  return require('react').createElement('NativePager',props,props.children);
})}));
jest.mock('react-native',()=>({View:'View',Pressable:'Pressable',StyleSheet:{create:(s:any)=>s},Animated:{
  createAnimatedComponent:(c:any)=>c,View:'AnimatedView',
  Value:class{setValue(){} interpolate(){return 0;}},add:()=>({interpolate:()=>0}),event:()=>()=>{},
}}));
jest.mock('react-native-paper',()=>({Text:'Text'}));
jest.mock('react-native-gesture-handler',()=>({GestureHandlerRootView:'Root',GestureDetector:'GestureDetector',Gesture:{Pan:jest.fn(()=>{
  const gesture:any={};for(const name of ['enabled','activeOffsetX','failOffsetY','onEnd','runOnJS'])gesture[name]=jest.fn((value:any)=>{gesture[name+'Value']=value;return gesture;});return gesture;
})}}));
let view:TestRenderer.ReactTestRenderer;
const onChange=jest.fn();
beforeEach(()=>jest.clearAllMocks());
afterEach(()=>act(()=>view.unmount()));
function mount(enabled=true){act(()=>{view=TestRenderer.create(React.createElement(StockTabsPager,{value:'balances',onChange,enabled},['balances','receipt','expense'].map(key=>React.createElement('Content',{key},key))));});}
it('uses native animated setPage for buttons, committing selection only on the native event',()=>{
  mount();
  act(()=>view.root.findAllByType('Pressable' as any)[1].props.onPress());
  expect(mockSetPage).toHaveBeenCalledWith(1);expect(onChange).not.toHaveBeenCalled();
  act(()=>view.root.findByType('NativePager' as any).props.onPageSelected({nativeEvent:{position:1}}));
  expect(onChange).toHaveBeenCalledWith('receipt');
  expect(mockSetPageWithoutAnimation).not.toHaveBeenCalled();
});
it('applies the order-document gesture thresholds, swipes both directions, and does not wrap',()=>{
  mount();
  const gesture=view.root.findByType('GestureDetector' as any).props.gesture;
  expect(gesture.activeOffsetXValue).toEqual([-28,28]);expect(gesture.failOffsetYValue).toEqual([-11,11]);
  const swipe=(x:number,y=0)=>act(()=>gesture.onEndValue({translationX:x,translationY:y,velocityX:0,velocityY:0}));
  swipe(-100);swipe(-100);swipe(-100);swipe(100);swipe(100);swipe(100);
  expect(mockSetPage.mock.calls.map(args=>args[0])).toEqual([1,2,1,0]);
  swipe(-50,120);expect(mockSetPage).toHaveBeenCalledTimes(4);
});
it('blocks paging while a warehouse picker or image overlay owns the gesture',()=>{
  mount(false);
  expect(view.root.findByType('GestureDetector' as any).props.gesture.enabledValue).toBe(false);
  act(()=>view.root.findAllByType('Pressable' as any)[2].props.onPress());
  expect(mockSetPage).not.toHaveBeenCalled();
});
it('resets an externally changed tab without playing a second animation',()=>{
  mount();
  act(()=>view.update(React.createElement(StockTabsPager,{value:'expense',onChange})));
  expect(mockSetPageWithoutAnimation).toHaveBeenCalledWith(2);
});
