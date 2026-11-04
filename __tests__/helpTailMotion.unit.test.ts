import {helpTailDisplacement,helpTailMotionLimit} from '../src/features/help/helpTailMotion';
const before={width:390,height:800,content:300,margin:400};
const active={active:true,liveGrowth:true};

test.each([['text',60],['voice',88],['photo',360],['album',620]])('%s uses the full measured growth in both short and long histories',(_kind,growth)=>{
  expect(helpTailDisplacement(before,{...before,content:before.content+growth,margin:Math.max(0,before.margin-growth)},active)).toBe(growth);
  const long={...before,content:1600,margin:0};
  expect(helpTailDisplacement(long,{...long,content:long.content+growth},active)).toBe(growth);
});

test('crossing from bottom alignment to scrolling has one continuous owner',()=>{
  expect(helpTailDisplacement({...before,content:680,margin:20},{...before,content:1040,margin:0},active)).toBe(360);
});

test('keyboard geometry, history prepend and reading away from the end do not get an arrival animation',()=>{
  const next={...before,content:660,margin:40};
  expect(helpTailDisplacement(before,next,{...active,active:false})).toBe(0);
  expect(helpTailDisplacement(before,next,{...active,liveGrowth:false})).toBe(0);
  expect(helpTailDisplacement(before,{...next,height:500},active)).toBe(0);
  expect(helpTailDisplacement(null,next,active)).toBe(0);
});

test('a shorter replacement eases down and rapid accumulated growth stays inside rendered viewports',()=>{
  expect(helpTailDisplacement(before,{...before,content:250,margin:450},active)).toBe(-50);
  expect(helpTailDisplacement(before,{...before,content:1300,margin:0},active)).toBe(800);
  expect(helpTailDisplacement({...before,content:1300},{...before,content:300},active)).toBe(-800);
  expect(helpTailMotionLimit(320)).toBe(320);
  expect(helpTailMotionLimit(Infinity)).toBe(0);
});