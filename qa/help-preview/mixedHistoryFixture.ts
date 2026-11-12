import type {HelpMessage} from '../../src/features/help/helpApi';
import {createFixtureAlbum} from './albumFixture';

const START=Date.UTC(2026,0,15,12);
const assistantLengths=new Map([[2,37],[4,206],[16,375]]);
const systemSequences=new Set([5,6,14,17,18,20]);
const closureSequences=new Set([21,35,37]);
const sizedText=(length:number)=>'Учебный ответ: проверим состояние и продолжим локальную диагностику. '.repeat(8).slice(0,length);

/** Geometry-only fixture: grouped messages, local illustrations and a synthetic tone. */
export function createMixedFixtureHistory(ticketId:number,sample:HelpMessage,owner:HelpMessage['author'],specialist:HelpMessage['author']):HelpMessage[]{
  return Array.from({length:57},(_,index):HelpMessage=>{
    const sequence=index+1;
    const own=sequence===11||sequence===54||sequence===56||closureSequences.has(sequence)
      ||![10,44,55,57].includes(sequence)&&Math.floor(index/3)%2===0;
    const row:HelpMessage={...sample,id:sequence,ticketId,sequence,clientMessageId:null,
      authorId:own?owner!.id:specialist!.id,author:own?owner:specialist,authorRole:own?'USER':'IT',
      kind:'TEXT',text:['Да','Проверяю','Готово','Спасибо','Продолжим','Уточнил'][index%6],
      createdAt:new Date(START+index*45_000).toISOString(),editedAt:null,
      replyToId:null,replyTo:null,forwardedFromId:null,rating:null,attachments:[],reactions:[],
      assistantRun:undefined,itStatusChange:null,ticketStatusChange:null};
    const answerLength=assistantLengths.get(sequence);
    if(answerLength){
      row.authorId=null;row.author=null;row.authorRole='SYSTEM';row.text=sizedText(answerLength);
      row.assistantRun={ticketId,runId:`qa-mixed-${ticketId}-${sequence}`,eventId:sequence,status:'completed',step:3,completedSteps:4,startedAt:START+index*45_000,updatedAt:START+index*45_000,
        ...(sequence===2?{questions:[{id:'qa-detail',header:'Уточнение',question:'Какой шаг проверяем?',multiSelect:false,options:[{label:'Первый шаг'},{label:'Следующий шаг'}]}]}:{})};
    }else if(systemSequences.has(sequence)){
      row.authorId=null;row.author=null;row.authorRole='SYSTEM';row.kind='SYSTEM';row.text=`Учебное событие ${sequence}`;
    }else if(closureSequences.has(sequence)){
      row.kind='CLOSURE';row.rating=4;row.ticketStatusChange='CLOSED';row.text='Готово';
    }
    if([10,11,44].includes(sequence)){
      row.text='';row.attachments=createFixtureAlbum(ticketId,sequence,2).slice(0,sequence===11?2:1);
    }
    if(sequence===54){
      row.text='';row.attachments=[{id:`qa-voice-${ticketId}-${sequence}`,name:'Учебный звук.wav',kind:'AUDIO',mimeType:'audio/wav',size:128044,url:'qa-tone:8',durationMs:8000}];
    }
    if(sequence===55)row.text='Всё ок.';
    if(sequence===56)row.text='Принято!';
    if(sequence===57)row.text='Готово';
    return row;
  });
}
