import {createHelpTextReveal,updateHelpTextReveal,stepHelpTextReveal,helpTextBreaks} from '../src/features/help/helpTextReveal';
test('idle generation wait does not consume the reveal budget of the first received chunk',()=>{
 let state=createHelpTextReveal('r','',true,0);state=updateHelpTextReveal(state,'r','А'.repeat(100),true,false,true,10000);
 state=stepHelpTextReveal(state,10040);expect(state.offset).toBe(20);expect(state.offset).toBeLessThan(state.source.length);
 expect(stepHelpTextReveal(state,10200).offset).toBe(100);
});
test('new chunks extend a live prefix without restarting it; large bursts catch up within the bounded buffer',()=>{
 let state=createHelpTextReveal('r','',true,0);state=updateHelpTextReveal(state,'r','x'.repeat(100),true,false,true,0);state=stepHelpTextReveal(state,40);const shown=state.offset;
 state=updateHelpTextReveal(state,'r','x'.repeat(12000),true,false,true,50);expect(state.offset).toBe(shown);expect(stepHelpTextReveal(state,250).offset).toBe(12000);
});
test('completed history and newly mounted cached partial responses are immediate',()=>{
 for(const active of [false,true]){const state=createHelpTextReveal('r','Сохранённый текст',active,10);expect(state.offset).toBe(state.source.length);expect(state.breaks).toEqual([]);}
});
test('completion drains a live prefix quickly, while corrections, stops and errors replace it immediately',()=>{
 let state=updateHelpTextReveal(createHelpTextReveal('r','',true,0),'r','Текст ответа',true,false,true,0);
 state=updateHelpTextReveal(state,'r','Текст ответа с источниками',false,true,true,10);
 expect(state.deadline).toBe(130);expect(stepHelpTextReveal(state,130).offset).toBe(state.source.length);
 for(const [identity,text,active,complete,enabled] of [['new','Новый ответ',true,false,true],['r','Исправленный ответ',true,false,true],['r','Текст ответа',false,false,true],['r','',false,false,true],['r','Текст ответа',true,false,false]] as const){
  const next=updateHelpTextReveal(state,identity,text,active,complete,enabled,20);expect(next.offset).toBe(text.length);
 }
});
test.each([false,true])('Unicode boundaries preserve combining marks, emoji modifiers, ZWJ families and flags (fallback=%s)',fallback=>{
 const clusters=['А','е\u0301','👩🏽‍💻','🇷🇺','👨‍👩‍👧‍👦','1️⃣','\r\n','Б'];const text=clusters.join('');
 let offset=0;const expected=[0,...clusters.map(cluster=>(offset+=cluster.length))];expect(helpTextBreaks(text,fallback)).toEqual(expected);
 let state=updateHelpTextReveal(createHelpTextReveal('r','',true,0),'r',text,true,false,true,0);
 for(let now=1;now<=200;now+=7){state=stepHelpTextReveal(state,now);expect(expected).toContain(state.offset);}
});
