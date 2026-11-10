import type {HelpMessage} from '../src/features/help/helpApi';
import {helpQuestionExchanges,helpPendingQuestionExchanges} from '../src/features/help/helpQuestionHistory';
import {helpQuestions,formatHelpQuestionAnswers} from '../src/features/help/helpQuestions';
import {helpNavigationIndex,helpTimelineRows,helpTimelineRowSequence} from '../src/features/help/helpTimelineModel';
import {helpTailContentChanged} from '../src/features/help/helpTailMotion';

const owner=14;
const message=(sequence:number,patch:Partial<HelpMessage>={}):HelpMessage=>({
 id:sequence,ticketId:63,sequence,clientMessageId:null,authorId:owner,author:{id:owner,name:'Employee',avatarUrl:null},authorRole:'USER',
 kind:'TEXT',text:'',createdAt:'2026-11-07T10:00:00Z',editedAt:null,replyToId:null,replyTo:null,
 forwardedFromId:null,rating:null,attachments:[],reactions:[],...patch,
});
const question=(sequence=10)=>message(sequence,{authorId:null,author:null,authorRole:'SYSTEM',assistantRun:{
 runId:`r${sequence}`,eventId:1,ticketId:63,status:'completed',step:4,completedSteps:4,startedAt:1,updatedAt:2,
 questions:[{id:'source',header:'Источник',question:'На какие новости нужна ссылка?',multiSelect:false,options:[]}],
}});
const answer=(q=question(),patch:Partial<HelpMessage>={})=>message(q.sequence+1,{text:`${helpQuestions(q)[0].question}\nОтвет: Российские новости, сайт например`,replyToId:q.id,...patch});
const grouped=(q=question(),a=answer(q),firstUnread?:number)=>helpTimelineRows([q,a],firstUnread,[],helpQuestionExchanges([q,a],owner));

test('explicit persisted reply survives serialization and reload without mutating records',()=>{
 const q=question(),a=answer(q),input=[q,a];
 const exchange=helpQuestionExchanges(input,owner).get(q.id)!;
 expect(exchange.message).toBe(a);
 expect(exchange.answers).toEqual([{questionId:'q:0:source',question:'На какие новости нужна ссылка?',answer:'Российские новости, сайт например',skipped:false}]);
 expect([...helpQuestionExchanges(JSON.parse(JSON.stringify(input)),owner)]).toEqual([...helpQuestionExchanges(input,owner)]);
 expect(input).toEqual([q,a]);
 expect(helpQuestionExchanges([a,q],owner).size).toBe(0);
});

test('legacy questionnaire uses exact adjacent grammar; ordinary replies are never consumed',()=>{
 const q=question();
 expect(helpQuestionExchanges([q,answer(q,{replyToId:null})],owner).has(q.id)).toBe(true);
 for(const text of ['Российские новости',`${q.text}\nОтвет: Новости`,'На какие новости нужна ссылка?\nОтвет: ', 'На какие новости нужна ссылка?\nДа', 'prefix\nНа какие новости нужна ссылка?\nОтвет: Новости']) {
  expect(helpQuestionExchanges([q,answer(q,{text})],owner).size).toBe(0);
 }
 expect(helpQuestionExchanges([q,answer(q,{replyToId:999})],owner).size).toBe(0);
});

test('all questions, skips, multiline free text and selected options retain exact answers',()=>{
 const q=question();q.assistantRun!.questions!.push({id:'format',header:'Формат',question:'Какой формат?',multiSelect:true,options:[{label:'Сайт'},{label:'Текст'}]});
 const questions=helpQuestions(q);
 const text=formatHelpQuestionAnswers(questions,{index:1,collapsed:false,answers:{[questions[0].id]:{selected:[],text:'',skipped:true},[questions[1].id]:{selected:['Сайт','Текст'],text:'Первая строка\n\nВторая строка'}}});
 const exchange=helpQuestionExchanges([q,answer(q,{text})],owner).get(q.id)!;
 expect(exchange.answers).toEqual([
  {questionId:questions[0].id,question:questions[0].question,answer:'',skipped:true},
  {questionId:questions[1].id,question:questions[1].question,answer:'Сайт; Текст; Первая строка\n\nВторая строка',skipped:false},
 ]);
 expect(helpQuestionExchanges([q,answer(q)],owner).size).toBe(0);
 const ambiguous=`${text}\n\nКакой формат?\nОтвет: Ещё один`;
 expect(helpQuestionExchanges([q,answer(q,{text:ambiguous})],owner).size).toBe(0);
});

test('incomplete pages, sequence gaps, different tickets/authors and non-user events stay standalone',()=>{
 const q=question(),a=answer(q);
 expect(helpQuestionExchanges([a],owner).size).toBe(0);
 expect(helpQuestionExchanges([q],owner).size).toBe(0);
 for(const patch of [{sequence:12},{ticketId:74},{authorId:121},{authorRole:'IT' as const},{kind:'CLOSURE' as const},{itStatusChange:'AI_RESUMED' as const},{ticketStatusChange:'REOPENED' as const},{assistantRun:q.assistantRun},{forwardedFromId:100},{id:-1}]) {
  expect(helpQuestionExchanges([q,{...a,...patch}],owner).size).toBe(0);
 }
 expect(helpQuestionExchanges([q,a],undefined).size).toBe(0);
 expect(helpQuestionExchanges([q,a],121).size).toBe(0);
 expect(helpQuestionExchanges([q,a,{...a,id:77}],owner).size).toBe(0);
 expect(helpQuestionExchanges([q,a,{...a,sequence:99}],owner).size).toBe(0);
});

test('edits deterministically update the grouped answer or fall back to the original message',()=>{
 const q=question(),a=answer(q,{editedAt:'2026-11-07T10:01:00Z',text:'На какие новости нужна ссылка?\nОтвет: Изменённый ответ'});
 expect(helpQuestionExchanges([q,a],owner).get(q.id)?.answers[0].answer).toBe('Изменённый ответ');
 expect(helpQuestionExchanges([q,{...a,text:'Теперь обычный ответ'}],owner).size).toBe(0);
});

test('grouped records preserve attachments and reactions for their existing interactive renderer',()=>{
 const q=question(),a=answer(q,{attachments:[{id:'file',name:'news.txt',mimeType:'text/plain',size:3,kind:'FILE',url:'/files/file'}],reactions:[{emoji:'👍',count:1,mine:true,userIds:[owner]}]});
 expect(helpQuestionExchanges([q,a],owner).get(q.id)?.message).toBe(a);
 expect(grouped(q,a).find(row=>row.kind==='message')?.questionAnswer).toBe(a);
});

test('one stable AI cell retains search/reply/saved-anchor aliases and unread boundary for the answer',()=>{
 const q=question(),a=answer(q),rows=grouped(q,a,a.sequence);
 expect(rows.map(row=>row.kind)).toEqual(['date','unread','message']);
 const cell=rows[2];
 expect(cell.key).toBe('message:10');
 expect(cell.message).toBe(q);expect(cell.questionAnswer).toBe(a);
 expect(helpTimelineRowSequence(cell)).toBe(a.sequence);
 for(const target of [{kind:'message' as const,messageId:a.id},{kind:'anchor' as const,messageId:a.id,sequence:a.sequence,offset:12},{kind:'message' as const,sequence:q.sequence}]) {
  expect(helpNavigationIndex(rows,{key:1,...target})).toBe(2);
 }
 expect(helpNavigationIndex(rows,{kind:'unread',key:2,sequence:a.sequence})).toBe(1);
});

test('page joins preserve AI identity; a missing question or stale exchange never drops its answer',()=>{
 const q=question(),a=answer(q),exchanges=helpQuestionExchanges([q,a],owner);
 expect(helpTimelineRows([a],null,[],exchanges).filter(row=>row.kind==='message').map(row=>row.message.id)).toEqual([a.id]);
 expect(helpTimelineRows([q],null,[],exchanges).filter(row=>row.kind==='message').map(row=>row.key)).toEqual(['message:10']);
 expect(helpTimelineRows([q,a],null,[],exchanges).filter(row=>row.kind==='message').map(row=>row.key)).toEqual(['message:10']);
 expect(helpTimelineRows([a,q],null,[],exchanges).filter(row=>row.kind==='message').map(row=>row.message.id)).toEqual([a.id,q.id]);
});

test('pending delivery stays independently retryable and is deduplicated only by the existing receipt',()=>{
 const q=question(),a=answer(q,{clientMessageId:'pending-answer'}),pending={key:'pending-answer',create:false,ticketId:q.ticketId,createdAt:Date.now(),input:{text:a.text,replyToId:q.id,clientMessageId:'pending-answer'}};
 expect(helpTimelineRows([q],null,[pending]).map(row=>row.kind)).toEqual(['date','message','pending']);
 expect(helpTimelineRows([q,a],null,[pending],helpQuestionExchanges([q,a],owner)).map(row=>row.kind)).toEqual(['date','message']);
});

test('answer added within the stable AI cell arms existing tail motion; replay metadata does not',()=>{
 const q=question(),a=answer(q),before=helpTimelineRows([q]),after=grouped(q,a);
 expect(helpTailContentChanged(before,after)).toBe(true);
 expect(helpTailContentChanged(after,grouped({...q}, {...a,author:{id:owner,name:'Updated profile',avatarUrl:null}}))).toBe(false);
 expect(helpTailContentChanged(after,grouped(q,{...a,text:'На какие новости нужна ссылка?\nОтвет: Изменено'}))).toBe(true);
 expect(helpTailContentChanged(after,before)).toBe(true);
});


test('pending questionnaire stays inside the same AI cell through retry, error and server ACK',()=>{
 const q=question(),a=answer(q,{clientMessageId:'answer-key'});
 const pending={key:'answer-key',create:false,ticketId:q.ticketId,createdAt:Date.parse(a.createdAt),status:'sending' as const,input:{text:a.text,replyToId:q.id,clientMessageId:'answer-key'}};
 const exchanges=helpPendingQuestionExchanges([q],[pending],owner);
 expect(exchanges.get(q.id)?.pending).toBe(pending);
 expect(exchanges.get(q.id)?.message.sequence).toBe(0);
 const before=helpTimelineRows([q],null,[pending],undefined,exchanges);
 expect(before.map(row=>row.kind)).toEqual(['date','message']);
 expect(before[1].questionPending).toBe(pending);
 expect(before[1].questionAnswer).toBeUndefined();
 expect(helpTimelineRowSequence(before[1])).toBe(q.sequence);
 const failed={...pending,status:'failed' as const,error:'Нет подключения'};
 const failedRows=helpTimelineRows([q],null,[failed],undefined,helpPendingQuestionExchanges([q],[failed],owner));
 expect(failedRows[1].questionPending).toBe(failed);
 expect(helpTailContentChanged(before,failedRows)).toBe(true);
 const accepted=helpTimelineRows([q,a],null,[pending],helpQuestionExchanges([q,a],owner),helpPendingQuestionExchanges([q,a],[pending],owner));
 expect(accepted.map(row=>row.key)).toEqual(before.map(row=>row.key));
 expect(accepted[1].questionAnswer).toBe(a);
 expect(accepted[1].questionPending).toBeUndefined();
 expect(helpTimelineRowSequence(accepted[1])).toBe(a.sequence);
 expect(helpTailContentChanged(before,accepted)).toBe(true);
});

test('only a sole explicit pending questionnaire for the latest question may group',()=>{
 const q=question(),a=answer(q);
 const pending={key:'pending-answer',create:false,ticketId:q.ticketId,createdAt:Date.parse(a.createdAt),input:{text:a.text,replyToId:q.id}};
 for(const item of [{...pending,input:{text:a.text}},{...pending,ticketId:99},{...pending,create:true},{...pending,action:'close' as const},{...pending,input:{...pending.input,text:'обычное сообщение'}},{...pending,input:{...pending.input,forwardedFromId:123}}]) {
  expect(helpPendingQuestionExchanges([q],[item],owner).size).toBe(0);
 }
 expect(helpPendingQuestionExchanges([q],[pending,{...pending,key:'duplicate'}],owner).size).toBe(0);
 expect(helpPendingQuestionExchanges([q,message(12)],[pending],owner).size).toBe(0);
 expect(helpPendingQuestionExchanges([],[pending],owner).size).toBe(0);
 expect(helpPendingQuestionExchanges([q,a],[pending],owner).size).toBe(0);
 const stale=helpPendingQuestionExchanges([q],[pending],owner);
 expect(helpTimelineRows([],null,[pending],undefined,stale).filter(row=>row.kind==='pending')).toHaveLength(1);
});
