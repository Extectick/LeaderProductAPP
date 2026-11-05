import {normalizeEntityTarget,type EntityCardData,type EntityTarget} from '../../src/shared/entityLinks';
import type {EntityCardResult} from '../../src/features/entityCards/entityApi';
import {EntityCardError} from '../../src/features/entityCards/entityTypes';
import {fixtureProfile} from './fixtureAuth';

const guid=(id:number)=>`00000000-0000-4000-8000-${String(id).padStart(12,'0')}`;
export const productTarget=(id=1):EntityTarget=>({v:1,source:'onec',baseKey:'fixture',metaType:'Catalogs',name:'Номенклатура',guid:guid(id)});
export const orderTarget:EntityTarget={v:1,source:'onec',baseKey:'fixture',metaType:'Documents',name:'ЗаказКлиента',guid:guid(2)};
export const userTarget:EntityTarget={v:1,source:'app',kind:'user',id:'902'};
export const warehouseTarget:EntityTarget={v:1,source:'onec',baseKey:'fixture',metaType:'Catalogs',name:'Склады',guid:guid(4)};
export const customerTarget:EntityTarget={v:1,source:'onec',baseKey:'fixture',metaType:'Catalogs',name:'Контрагенты',guid:guid(3)};

export function entityIdentity(target:EntityTarget){
 const normalized=normalizeEntityTarget(target);if(!normalized)throw new EntityCardError('unsupported','ENTITY_INVALID_TARGET','Тестовая ссылка не поддерживается.');return JSON.stringify(normalized);
}
function syntheticCard(target:EntityTarget,maxRows:number):EntityCardData{
 if(target.source!=='onec')throw new EntityCardError('not-found','ENTITY_NOT_FOUND','Тестовый объект не найден.');
 if(target.name==='Номенклатура')return {target,view:'product',title:`Тестовый товар ${Number(target.guid.slice(-3))||1}`,subtitle:'Синтетическая номенклатура · локальная проверка',truncated:false,
  fields:[{key:'code',label:'Код',value:'ТЕСТ-001'},{key:'unit',label:'Единица',value:'шт'},{key:'stock',label:'В наличии',value:40},{key:'reserve',label:'Резерв',value:6},
   {key:'warehouse',label:'Склад',value:{label:'Тестовый склад',target:warehouseTarget}},{key:'manager',label:'Ответственный',value:{label:'Тестовый сотрудник',target:userTarget}}],
  tables:[{key:'packages',label:'Упаковки',columns:[{key:'name',label:'Упаковка'},{key:'quantity',label:'Количество'}],
   rows:[{name:'Штука',quantity:1},{name:'Коробка',quantity:12},{name:'Палета',quantity:240}],truncated:false},
   {key:'properties',label:'Характеристики для проверки прокрутки',columns:[{key:'name',label:'Свойство'},{key:'value',label:'Значение'}],rows:Array.from({length:20},(_,i)=>({name:`Тестовая характеристика ${i+1}`,value:`Синтетическое значение ${i+1}`})),truncated:false}]};
 if(target.name==='ЗаказКлиента')return {target,view:'client-order',title:'Тестовый заказ ТЕСТ-002',subtitle:'5 ноября 2026 · данные не отправляются в 1С',truncated:maxRows<140,
  fields:[{key:'customer',label:'Клиент',value:{label:'Тестовый контрагент',target:customerTarget}},{key:'manager',label:'Менеджер',value:{label:'Тестовый сотрудник',target:userTarget}},
   {key:'delivery',label:'Доставка',value:'Самовывоз'},{key:'posted',label:'Проведён',value:false},{key:'total',label:'Сумма',value:14000}],
  tables:[{key:'items',label:'Товары',columns:[{key:'product',label:'Номенклатура'},{key:'quantity',label:'Количество'},{key:'price',label:'Цена'}],
   rows:Array.from({length:Math.min(maxRows,140)},(_,i)=>({product:{label:`Тестовый товар ${i+1}`,target:productTarget(i+1)},quantity:i%5+1,price:100+i})),truncated:maxRows<140}]};
 return {target,view:'generic',title:target.name==='Склады'?'Тестовый склад':'Тестовый контрагент',subtitle:'Универсальная карточка · только синтетические данные',
  fields:[{key:'name',label:'Наименование',value:target.name==='Склады'?'Тестовый склад':'Тестовый контрагент'},{key:'active',label:'Активен',value:true},
   {key:'manager',label:'Ответственный',value:{label:'Тестовый сотрудник',target:userTarget}},{key:'order',label:'Связанный заказ',value:{label:'Заказ ТЕСТ-002',target:orderTarget}}],tables:[],truncated:false};
}
/** Synthetic in-memory reads, including the same cancellation semantics as the real adapter. */
export async function loadEntityCard(target:EntityTarget,_userId:number,signal:AbortSignal,options:{maxTabularRows?:number}={}):Promise<EntityCardResult>{
 signal.throwIfAborted();entityIdentity(target);
 await new Promise<void>((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);const error=new Error('Request aborted');error.name='AbortError';reject(error);};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},140);signal.addEventListener('abort',abort,{once:true});
 });
 signal.throwIfAborted();
 if(target.source==='app')return target.kind==='user'?{kind:'profile',profile:fixtureProfile(Number(target.id))}:{kind:'stock-product',product:{guid:target.guid,name:'Тестовый товар приложения',code:'QA',baseUnit:null,inStock:0,available:0,reserved:0,updatedAt:null}};
 return {kind:'entity',data:syntheticCard(target,options.maxTabularRows??100)};
}
