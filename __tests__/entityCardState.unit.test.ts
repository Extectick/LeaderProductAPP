import {entityCardReducer as reduce,initialEntityCardState as initial} from '../src/features/entityCards/entityCardState';
import type {EntityTarget} from '../src/shared/entityLinks';
const product:EntityTarget={v:1,source:'onec',baseKey:'torg2026',metaType:'Catalogs',name:'Номенклатура',guid:'12345678-abcd-1234-abcd-123456789abc'};
const user:EntityTarget={v:1,source:'app',kind:'user',id:'121'};
const open=(target:EntityTarget,account='dev:1')=>({type:'open' as const,account,target});
test('nested cards retain the parent identity/title/scroll when going back',()=>{
 let state=reduce(initial,open(product));const first=state.frames[0].key;
 state=reduce(state,{type:'title',key:first,title:'Наименование продукции'});
 state=reduce(state,{type:'scroll',key:first,offset:450});
 state=reduce(state,open(user));expect(state.frames).toHaveLength(2);
 state=reduce(state,{type:'back'});expect(state.frames[0]).toMatchObject({key:first,title:'Наименование продукции',scrollOffset:450});expect(state.closing).toBe(false);
 state=reduce(state,{type:'back'});expect(state.closing).toBe(true);expect(state.frames).toHaveLength(1);
 state=reduce(state,{type:'dismissed',session:state.session});expect(state.frames).toHaveLength(0);
});
test('cycles return to an existing card and never make an endless duplicate stack',()=>{
 let state=reduce(initial,open(product));state=reduce(state,open(user));state=reduce(state,open(product));
 expect(state.frames).toHaveLength(1);expect(state.sequence).toBe(2);
});
test('late dismiss from an old session cannot close a newly opened card',()=>{
 let state=reduce(initial,open(product));const previous=state.session;
 state=reduce(state,{type:'close'});state=reduce(state,open(user));
 state=reduce(state,{type:'dismissed',session:previous});expect(state.frames).toHaveLength(1);expect(state.frames[0].kind).toBe('entity');
});
test('changing accounts discards previous cards and late updates cannot restore them',()=>{
 let state=reduce(initial,open(product));const first=state.frames[0].key;
 state=reduce(state,{type:'account',account:'dev:2'});
 expect(state.frames).toHaveLength(0);expect(reduce(state,{type:'title',key:first,title:'Late response'})).toBe(state);
 state=reduce(state,open(user,'dev:2'));expect(state.account).toBe('dev:2');expect(state.frames).toHaveLength(1);
});
test('protected connection form can only target the current personal 1C base',()=>{
 let state=reduce(initial,open(product));expect(reduce(state,{type:'connect',baseKey:'other'})).toBe(state);
 state=reduce(state,{type:'connect',baseKey:'torg2026'});expect(state.frames.at(-1)).toMatchObject({kind:'connection',baseKey:'torg2026'});
 state=reduce(state,{type:'back'});expect(state.frames.at(-1)).toMatchObject({kind:'entity',target:product});
 expect(reduce(reduce(initial,open(user)),{type:'connect',baseKey:'torg2026'}).frames).toHaveLength(1);
});
