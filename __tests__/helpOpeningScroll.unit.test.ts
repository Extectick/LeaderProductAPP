import {helpOpeningScrollRef,type HelpOpeningScrollPosition} from '../src/features/help/helpOpeningScroll';

test('initial index and delayed replay both land at the native end, including a tall final message',()=>{
  let offset=0,end=1400;
  const native={scrollTo:jest.fn(({y}:{y:number})=>{offset=y;}),scrollToEnd:jest.fn(()=>{offset=end;})};
  const scroll=helpOpeningScrollRef(native,()=>({kind:'end'}));
  // FlashList seeds the TOP of a last message taller than the viewport.
  scroll.scrollTo({y:400,animated:false});expect(offset).toBe(1400);
  // Initial measurements may grow the content before its queued replay runs.
  end=1450;scroll.scrollTo({y:400,animated:false});expect(offset).toBe(1450);
  expect(native.scrollTo).not.toHaveBeenCalled();
  expect(native.scrollToEnd.mock.calls).toEqual([[{animated:false}],[{animated:false}]]);
});
test('a measured saved position is identical for the initial command and replay',()=>{
  const native={scrollTo:jest.fn(),scrollToEnd:jest.fn()};
  const scroll=helpOpeningScrollRef(native,()=>({kind:'offset',offset:259}));
  scroll.scrollTo({x:0,y:364,animated:true});scroll.scrollTo({x:0,y:364,animated:false});
  expect(native.scrollTo.mock.calls).toEqual([[{x:0,y:259,animated:false}],[{x:0,y:259,animated:false}]]);
});
test('unmeasured preparation passes through, then user control releases all normalization',()=>{
  const native={scrollTo:jest.fn(),scrollToEnd:jest.fn()};
  let position:HelpOpeningScrollPosition|null=null;
  const scroll=helpOpeningScrollRef(native,()=>position);
  scroll.scrollTo({y:900,animated:false});
  expect(native.scrollTo).toHaveBeenLastCalledWith({y:900,animated:false});
  position={kind:'end'};scroll.scrollTo({y:900,animated:false});expect(native.scrollToEnd).toHaveBeenCalledTimes(1);
  position=null;scroll.scrollTo({y:120,animated:true});
  expect(native.scrollTo).toHaveBeenLastCalledWith({y:120,animated:true});
});
test('native measurement, responder and edge APIs retain the inner ref as this',()=>{
  const native={tag:13,scrollTo:jest.fn(),scrollToEnd:jest.fn(),getScrollableNode(){return this.tag;},measure(callback:(tag:number)=>void){callback(this.tag);},getScrollResponder(){return this;}};
  const scroll=helpOpeningScrollRef(native,()=>null),callback=jest.fn();
  scroll.measure(callback);expect(callback).toHaveBeenCalledWith(13);
  expect(scroll.getScrollableNode()).toBe(13);expect(scroll.getScrollResponder()).toBe(native);
  scroll.scrollToEnd({animated:true});expect(native.scrollToEnd).toHaveBeenCalledWith({animated:true});
});
