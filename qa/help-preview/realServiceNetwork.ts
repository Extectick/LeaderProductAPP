import type {HelpDetail,HelpMessage,HelpTicket} from '../../src/features/help/helpApi';
import type {HelpAccountNotice} from '../../src/features/help/helpAccountSync';
import {QA_USER_ID} from './realServiceEnvironment';

const owner={id:QA_USER_ID,name:'QA · Вы',avatarUrl:null};
const specialist={id:9000202,name:'QA · Специалист',avatarUrl:null};
const createdAt='2026-01-15T12:00:00.000Z';
const records=new Map<number,HelpDetail>();
for(const id of [6,74,77,1042]){
 const messages:HelpMessage[]=Array.from({length:id===74?12:4},(_,index)=>({
  id:id*1000+index+1,ticketId:id,sequence:index+1,clientMessageId:null,
  authorId:index%2?specialist.id:owner.id,author:index%2?specialist:owner,authorRole:index%2?'IT':'USER',
  kind:'TEXT',text:`QA #${id} · Сообщение ${index+1}. Проверка холодного открытия обращения.`,
  createdAt:new Date(Date.parse(createdAt)+index*60000).toISOString(),editedAt:null,replyToId:null,replyTo:null,forwardedFromId:null,rating:null,attachments:[],reactions:[],
 }));
 const lastMessage=messages.at(-1)!;
 const ticket:HelpTicket={id,number:id,title:`QA — обращение ${id}`,status:'OPEN',ownerId:owner.id,createdAt,updatedAt:lastMessage.createdAt,
  closedAt:null,sourceTicketId:null,sourceTicket:null,itRequested:true,
  members:[{userId:owner.id,role:'OWNER',user:owner,lastReadSequence:messages.length},{userId:specialist.id,role:'IT',user:specialist}],
  unreadCount:0,lastMessage,canReopen:false,aiEnabled:false,lastReadSequence:messages.length,lastSequence:messages.length};
 records.set(id,{ticket,messages,nextCursor:null,olderCursor:null,newerCursor:null,hasOlder:false,hasNewer:false,
  lastReadSequence:messages.length,firstUnreadSequence:null,lastSequence:messages.length,eventCursor:1,snapshotCursor:1});
}
// Matched short histories: only the last decision differs. No real dialogue text.
const questionHistory=[
 'Тест',
 'Проверил описание задачи. Для начала убедитесь, что приложение открыто и соединение доступно. Затем повторите действие один раз и посмотрите, появляется ли сообщение об ошибке. Это поможет определить следующий шаг проверки.',
 'Сбой',
 'Уточните, какое действие не прошло.',
 'Не получается открыть новый документ.',
 'Проверю доступные сведения.',
 'После повторного входа всё так же.',
 'Уточните, пожалуйста, какой документ вы открываете и на каком шаге возникает ошибка. Достаточно названия раздела и текста сообщения.',
];
for(const id of [14,15]){
 const messages:HelpMessage[]=questionHistory.map((text,index)=>{
  const at=Date.parse(createdAt)+index*60000;
  return {id:id*1000+index+1,ticketId:id,sequence:index+1,clientMessageId:null,
   authorId:index%2?null:owner.id,author:index%2?null:owner,authorRole:index%2?'SYSTEM':'USER',kind:'TEXT',text,
   createdAt:new Date(at).toISOString(),editedAt:null,replyToId:null,replyTo:null,forwardedFromId:null,rating:null,attachments:[],reactions:[],
   ...(index%2?{assistantRun:{runId:`qa-short-${id}-${index+1}`,eventId:index+1,ticketId:id,status:'completed' as const,
    step:4,completedSteps:4,startedAt:at-1000,updatedAt:at,activityVersion:1 as const,
    generation:{model:'qa-local',decision:index===7&&id===14?'clarify':'answer'}}}:{})};
 });
 const lastMessage=messages.at(-1)!;
 const ticket:HelpTicket={id,number:id,title:`QA — короткий диалог ${id}`,status:'OPEN',ownerId:owner.id,createdAt,updatedAt:lastMessage.createdAt,
  closedAt:null,sourceTicketId:null,sourceTicket:null,itRequested:false,members:[{userId:owner.id,role:'OWNER',user:owner,lastReadSequence:8}],
  unreadCount:0,lastMessage,canReopen:false,aiEnabled:true,lastReadSequence:8,lastSequence:8};
 records.set(id,{ticket,messages,nextCursor:null,olderCursor:null,newerCursor:null,hasOlder:false,hasNewer:false,
  lastReadSequence:8,firstUnreadSequence:null,lastSequence:8,eventCursor:1,snapshotCursor:1});
}
// Message presentation specimens: synthetic content, no external API or pushes.
for(const id of [16,17]){
 const detail=JSON.parse(JSON.stringify(records.get(15))) as HelpDetail;
 detail.ticket={...detail.ticket,id,number:id,title:id===16?'QA — новый вид сообщений':'QA — процесс ответа'};
 detail.messages=detail.messages.slice(0,4).map((message,index)=>({...message,id:id*1000+index+1,ticketId:id,
  text:['Не открывается заказ клиента. Помоги разобраться.','В каком разделе появляется ошибка?','В разделе «Заказы клиентов», после выбора заказа.','Проверим открытие заказа по шагам.\n\n1. Откройте **Заказы клиентов**.\n2. Выберите нужный заказ в списке.\n3. Если ошибка повторится, пришлите её текст или снимок экрана.\n\nИзменения в заказ вносить не нужно.'][index],
  ...(message.assistantRun?{assistantRun:{...message.assistantRun,runId:`qa-visual-${id}-${index}`,ticketId:id,
   ...(index===1?{questions:[{id:'section',header:'Раздел',question:'В каком разделе появляется ошибка?',multiSelect:false,options:[{label:'Заказы клиентов'},{label:'Карточка товара'}]}]}:{}),
   ...(id===17&&index===3?{status:'thinking' as const,activities:[{id:'check',kind:'tool' as const,label:'Проверяю доступность сервиса',status:'completed' as const},{id:'analysis',kind:'analysis' as const,label:'Изучаю описание ошибки',text:'Сопоставляю шаги открытия заказа с описанием пользователя.',status:'running' as const}]}:{})}}:{})}));
 if(id===17)detail.messages[3].text='';
 detail.ticket.lastMessage=detail.messages.at(-1)!;detail.ticket.lastSequence=4;detail.ticket.lastReadSequence=4;
 detail.lastSequence=4;detail.lastReadSequence=4;
 records.set(id,detail);
}
const requests:{path:string;method:string;status:number}[]=[];
let acquired=0,released=0;
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
const response=(path:string,method:string,status:number,data?:unknown)=>{
 requests.push({path,method,status});if(requests.length>100)requests.shift();
 return status===200?{ok:true,status,data:clone(data)}:{ok:false,status,message:'Локальный QA: действие не поддерживается.',backendErrorCode:'QA_UNSUPPORTED'};
};

/** Real HelpApi calls this transport. Nothing is forwarded to fetch or an external server. */
export async function apiClient(_path:string,options:{method?:string;body?:any}={}){
 const method=options.method??'GET';
 const url=new URL(_path,'http://qa.invalid'),path=url.pathname;
 // Preserve an asynchronous transport boundary without adding a timing workaround.
 await Promise.resolve();
 if(method==='GET'&&path==='/help/config')return response(path,method,200,{aiEnabled:true,canManage:false,maxAttachments:0,maxFileBytes:0});
 if(method==='GET'&&path==='/help/tickets'){
  const query=url.searchParams.get('q')?.toLocaleLowerCase()??'';
  const tickets=[...records.values()].map(row=>row.ticket).filter(row=>row.status===(url.searchParams.get('status')||'OPEN')&&row.title.toLocaleLowerCase().includes(query));
  return response(path,method,200,{tickets,nextCursor:null});
 }
 if(method==='POST'&&path==='/help/tickets/summaries')return response(path,method,200,{tickets:(options.body?.ids??[]).flatMap((id:number)=>records.has(id)?[records.get(id)!.ticket]:[])});
 if(method==='GET'&&path==='/help/events')return response(path,method,200,{events:[],nextCursor:1,hasMore:false});
 const match=/^\/help\/tickets\/(\d+)(?:\/(messages|read|sync|search))?$/.exec(path);
 const detail=match?records.get(Number(match[1])):undefined;
 if(match&&detail){
  if(method==='GET'&&!match[2])return response(path,method,200,detail);
  if(method==='GET'&&match[2]==='messages'){
   const {ticket,...page}=detail;
   return response(path,method,200,{...page,messages:page.messages.filter(message=>(!url.searchParams.has('before')||message.sequence<Number(url.searchParams.get('before')))&&(!url.searchParams.has('after')||message.sequence>Number(url.searchParams.get('after'))))});
  }
  if(method==='GET'&&match[2]==='sync')return response(path,method,200,{...detail,deletedMessageIds:[],nextCursor:1,hasMore:false});
  if(method==='GET'&&match[2]==='search')return response(path,method,200,{messages:detail.messages.filter(message=>message.text.includes(url.searchParams.get('q')??'')),total:detail.messages.length,nextCursor:null});
  if(method==='POST'&&match[2]==='read')return response(path,method,200,{ok:true});
 }
 if(method==='POST'&&path==='/help/read-all')return response(path,method,200,{ok:true});
 return response(path,method,404);
}
// Fail closed for any other feature accidentally requesting a transport in this QA graph.
export const httpRequest=apiClient;

/** No sockets, account bridges, push registration or outbox dispatchers are started. */
export function acquireHelpAccount(_userId:number,_listener:(notice:HelpAccountNotice)=>void){
 ++acquired;let active=true;
 return {getSocket:()=>null,isConnected:()=>active,syncTicket:async()=>{},refresh:async()=>{},recover:()=>{},
  release:()=>{if(active){active=false;++released;}}};
}
export function realServiceProbe(){return {mode:'real-useHelpService',syntheticOnly:true,storage:'memory',ticketIds:[...records.keys()],acquired,released,requests:[...requests]};}
