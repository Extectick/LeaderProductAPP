import {helpTailDisplacement} from '../src/features/help/helpTailMotion';
const before={width:390,height:800,content:300,margin:400};
const active={active:true,liveGrowth:true};
test('short native histories compensate the inner alignment margin even when native range stays fixed',()=>{
  expect(helpTailDisplacement(before,{...before,content:360,margin:340},{...active,native:true})).toBe(60);
});
test('crossing into a scrollable native history compensates only the short-history part',()=>{
  expect(helpTailDisplacement({...before,content:680,margin:20},{...before,content:760,margin:0},{...active,native:true})).toBe(20);
  expect(helpTailDisplacement({...before,content:900,margin:0},{...before,content:980,margin:0},{...active,native:true})).toBe(0);
});
test('web uses intrinsic row growth for short and long histories',()=>{
  expect(helpTailDisplacement(before,{...before,content:360,margin:340},{...active,native:false})).toBe(60);
  expect(helpTailDisplacement({...before,content:900,margin:0},{...before,content:980,margin:0},{...active,native:false})).toBe(80);
});
test('keyboard geometry, history prepend and reading away from the end do not get an arrival animation',()=>{
  const next={...before,content:360,margin:340};
  expect(helpTailDisplacement(before,next,{...active,native:true,active:false})).toBe(0);
  expect(helpTailDisplacement(before,next,{...active,native:true,liveGrowth:false})).toBe(0);
  expect(helpTailDisplacement(before,{...next,height:500},{...active,native:true})).toBe(0);
  expect(helpTailDisplacement(null,next,{...active,native:true})).toBe(0);
});
test('replacement with a shorter answer eases down without an overshoot',()=>{
  expect(helpTailDisplacement(before,{...before,content:250,margin:450},{...active,native:true})).toBe(-50);
});

test('large growth and shrink stay within nearby rendered cells in either direction',()=>{
  expect(helpTailDisplacement(before,{...before,content:1300,margin:0},{...active,native:false})).toBe(120);
  expect(helpTailDisplacement({...before,content:1300},{...before,content:300},{...active,native:false})).toBe(-120);
  const short={...before,height:320};
  expect(helpTailDisplacement(short,{...short,content:1300},{...active,native:false})).toBe(80);
  expect(helpTailDisplacement(short,{...short,margin:1400},{...active,native:true})).toBe(-80);
});
