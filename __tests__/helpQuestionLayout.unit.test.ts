import {helpQuestionBodyHeight} from '../src/features/help/helpQuestionLayout';

test('a four-option portrait question can use the remaining space without the arbitrary 55 percent cut',()=>{
  const height=helpQuestionBodyHeight({viewportHeight:820,imeInset:300,headerHeight:112});
  const compactTwoLineHeading=2*23+2*2;
  const fourTouchRows=4*44;
  expect(height).toBeGreaterThanOrEqual(compactTwoLineHeading+fourTouchRows+4);
  expect(height+48+36+8+16+60).toBeLessThanOrEqual(820-300-112);
});

test('an already resized viewport does not require another raw keyboard-height subtraction',()=>{
  expect(helpQuestionBodyHeight({viewportHeight:520,imeInset:0,headerHeight:112}))
    .toBe(helpQuestionBodyHeight({viewportHeight:820,imeInset:300,headerHeight:112}));
});

test.each([
  {composerHeight:48,extraDockHeight:0,dockPadding:16},
  {composerHeight:88,extraDockHeight:0,dockPadding:16},
  {composerHeight:168,extraDockHeight:80,dockPadding:16},
  {composerHeight:48,extraDockHeight:0,dockPadding:50},
])('input, attachment and safe-area growth retain room for the chat (%o)',extra=>{
  const available=560;
  const height=helpQuestionBodyHeight({viewportHeight:972,imeInset:300,headerHeight:112,...extra});
  const occupied=height+extra.composerHeight+extra.extraDockHeight+extra.dockPadding+8+36;
  expect(occupied+60).toBeLessThanOrEqual(available);
});

test('roomy layouts stay bounded and initial or invalid measurements keep a usable scroll body',()=>{
  expect(helpQuestionBodyHeight({viewportHeight:1600,imeInset:0,headerHeight:112})).toBe(240);
  expect(helpQuestionBodyHeight({viewportHeight:0,imeInset:300,headerHeight:112})).toBe(48);
  expect(helpQuestionBodyHeight({viewportHeight:NaN,imeInset:Infinity,headerHeight:-1})).toBe(48);
});
