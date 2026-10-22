import {stockSwipeTarget} from '../src/features/stockBalances/stockTabs';
const swipe=(x:number,y=0,vx=0,vy=0)=>({translationX:x,translationY:y,velocityX:vx,velocityY:vy});
it('moves one tab left/right and stops at both edges',()=>{
  expect(stockSwipeTarget(0,swipe(-100))).toBe(1);
  expect(stockSwipeTarget(1,swipe(-100))).toBe(2);
  expect(stockSwipeTarget(2,swipe(-100))).toBe(2);
  expect(stockSwipeTarget(2,swipe(100))).toBe(1);
  expect(stockSwipeTarget(1,swipe(100))).toBe(0);
  expect(stockSwipeTarget(0,swipe(100))).toBe(0);
});
it('ignores taps, short drags and predominantly vertical/diagonal scrolls',()=>{
  for(const event of [swipe(0),swipe(-28),swipe(-50,40),swipe(-50,150,800,900)])expect(stockSwipeTarget(1,event)).toBe(1);
});
it('accepts an intentional fast horizontal fling like the order pager',()=>{
  expect(stockSwipeTarget(0,swipe(-30,3,-800,100))).toBe(1);
});
