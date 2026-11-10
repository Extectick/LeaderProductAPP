import {createHelpTextReveal,updateHelpTextReveal,stepHelpTextReveal,helpTextBreaks,HELP_TEXT_BUFFER_MS,HELP_TEXT_FINAL_MS,HELP_TEXT_FRAME_MS} from '../src/features/help/helpTextReveal';
const start=(text:string,now=0)=>updateHelpTextReveal(createHelpTextReveal('r','',true,0),'r',text,true,false,true,now);

test('idle generation wait does not consume the first incoming chunk buffer',()=>{
 let state=start('А'.repeat(40),10000);
 expect(state.offset).toBe(0);
 state=stepHelpTextReveal(state,10020);expect(state.offset).toBe(10);
 expect(stepHelpTextReveal(state,10000+HELP_TEXT_BUFFER_MS).offset).toBe(40);
});
test('ordinary text arrives in whole words and follows the network within 80ms',()=>{
 let state=start('Первое слово второе слово третье слово');
 for(let now=HELP_TEXT_FRAME_MS;now<HELP_TEXT_BUFFER_MS;now+=HELP_TEXT_FRAME_MS){
  const previous=state.offset;state=stepHelpTextReveal(state,now);
  expect(state.offset).toBeGreaterThan(previous);
  const visible=state.source.slice(0,state.offset);
  expect(visible.endsWith(' ')||state.offset===state.source.length).toBe(true);
 }
 expect(stepHelpTextReveal(state,HELP_TEXT_BUFFER_MS).offset).toBe(state.source.length);
});
test('new chunks retain the visible prefix and large bursts do not create a seconds-long backlog',()=>{
 let state=start('x'.repeat(100));state=stepHelpTextReveal(state,40);const shown=state.offset;
 state=updateHelpTextReveal(state,'r','x'.repeat(12000),true,false,true,50);expect(state.offset).toBeGreaterThanOrEqual(shown);
 const next=stepHelpTextReveal(state,70);expect(next.offset).toBeGreaterThan(1000);expect(next.offset).toBeLessThan(12000);
 expect(stepHelpTextReveal(next,50+HELP_TEXT_BUFFER_MS).offset).toBe(12000);
});
test('repeated snapshots and irregular ticks do not reset the smoothing deadline',()=>{
 const text='А'.repeat(200);let regular=start(text),irregular=start(text);
 for(let now=20;now<=60;now+=20)regular=stepHelpTextReveal(regular,now);
 for(const now of [1,7,11,38,49,60]){
  irregular=stepHelpTextReveal(irregular,now);
  irregular=updateHelpTextReveal(irregular,'r',text,true,false,true,now);
 }
 expect(irregular.offset).toBe(regular.offset);expect(irregular.deadline).toBe(HELP_TEXT_BUFFER_MS);
 expect(stepHelpTextReveal(irregular,HELP_TEXT_BUFFER_MS).offset).toBe(text.length);
});
test('continuous network appends keep the visible prefix and catch up as soon as input stops',()=>{
 let state=createHelpTextReveal('r','',true,0),previous=0;
 for(let now=10;now<=1000;now+=10){
  state=updateHelpTextReveal(state,'r','Слово '.repeat(now/10),true,false,true,now);
  state=stepHelpTextReveal(state,now+5);
  expect(state.offset).toBeGreaterThanOrEqual(previous);previous=state.offset;
 }
 expect(state.offset).toBeGreaterThan(state.source.length-80);
 expect(stepHelpTextReveal(state,1000+HELP_TEXT_BUFFER_MS).offset).toBe(state.source.length);
});
test('history and newly mounted cached partial responses stay immediate',()=>{
 for(const active of [false,true]){const state=createHelpTextReveal('r','Сохранённый текст',active,10);expect(state.offset).toBe(state.source.length);expect(state.breaks).toEqual([]);}
});
test('completion commits the whole authoritative answer immediately without clearing or retyping it',()=>{
 let state=start('Первый текст ответа с продолжением');state=stepHelpTextReveal(state,20);expect(state.offset).toBeGreaterThan(0);
 const final='Первый текст ответа с продолжением и источником.';
 state=updateHelpTextReveal(state,'r',final,false,true,true,25);
 expect(HELP_TEXT_FINAL_MS).toBe(0);expect(state.offset).toBe(final.length);expect(state.source).toBe(final);
 expect(stepHelpTextReveal(state,45)).toBe(state);
});
test('corrections, withdrawals, stops, errors and disabled animation are authoritative immediately',()=>{
 const state=stepHelpTextReveal(start('Первый текст ответа'),20);
 for(const [identity,text,active,complete,enabled] of [['new','Новый ответ',true,false,true],['r','Исправленный ответ',true,false,true],['r','Первый текст',false,false,true],['r','',true,false,true],['r','',false,false,true],['r','Первый текст ответа',true,false,false]] as const){
  const next=updateHelpTextReveal(state,identity,text,active,complete,enabled,25);expect(next.offset).toBe(text.length);expect(next.source).toBe(text);
 }
});
test.each([false,true])('Unicode boundaries preserve combining marks, emoji modifiers, ZWJ families and flags (fallback=%s)',fallback=>{
 const clusters=['А','е\u0301','👩🏽‍💻','🇷🇺','👨‍👩‍👧‍👦','1️⃣','\r\n','Б'];const text=clusters.join('');
 let offset=0;const expected=[0,...clusters.map(cluster=>(offset+=cluster.length))];expect(helpTextBreaks(text,fallback)).toEqual(expected);
 let state=start(text);if(fallback)state={...state,breaks:helpTextBreaks(text,true)};
 for(let now=1;now<=HELP_TEXT_BUFFER_MS;now+=3){state=stepHelpTextReveal(state,now);expect(expected).toContain(state.offset);}
 expect(stepHelpTextReveal(state,HELP_TEXT_BUFFER_MS).offset).toBe(text.length);
});
test.each(['https://example.test/'+ 'long-path-'.repeat(30),'identifier_'+ 'value_'.repeat(50),'中文内容'.repeat(80)])('long unspaced chunks advance before the deadline without waiting for whitespace: %s',text=>{
 const first=stepHelpTextReveal(start(text),20);expect(first.offset).toBeGreaterThan(0);expect(first.offset).toBeLessThan(text.length);
 expect(stepHelpTextReveal(first,HELP_TEXT_BUFFER_MS).offset).toBe(text.length);
});
test('appending combining marks completes the visible grapheme without exposing a partial boundary',()=>{
 let state=createHelpTextReveal('r','е',true,0);state=updateHelpTextReveal(state,'r','е\u0301ж',true,false,true,10);
 expect(state.offset).toBe(2);expect(state.source.slice(0,state.offset)).toBe('е\u0301');
 expect(stepHelpTextReveal(state,10+HELP_TEXT_BUFFER_MS).offset).toBe(3);
});
