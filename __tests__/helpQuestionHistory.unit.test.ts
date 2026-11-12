import type {HelpMessage,HelpTicket} from '../src/features/help/helpApi';
import {helpQuestionReplySequence} from '../src/features/help/helpQuestionHistory';

const ticket:Pick<HelpTicket,'id'|'ownerId'|'lastMessage'>={id:63,ownerId:14,lastMessage:null};
const message=(sequence:number,patch:Partial<HelpMessage>={}):HelpMessage=>({
 id:sequence,ticketId:63,sequence,clientMessageId:null,authorId:14,author:{id:14,name:'Employee',avatarUrl:null},authorRole:'USER',
 kind:'TEXT',text:'Windows 11',createdAt:'2026-11-07T10:00:00Z',editedAt:null,replyToId:null,replyTo:null,
 forwardedFromId:null,rating:null,attachments:[],reactions:[],...patch,
});

test('history uses the owner reply regardless of who is viewing the conversation',()=>{
 const before=message(10),answer=message(12),assistant=message(13,{authorId:null,authorRole:'SYSTEM'});
 const sequence=helpQuestionReplySequence([assistant,answer,before],ticket);
 expect(sequence).toBe(12);
 // Every observer sees the same answer evidence: older question answered,
 // newer question still awaiting its own subsequent reply.
 expect(sequence>11).toBe(true);
 expect(sequence>13).toBe(false);
});

test('IT, system, AI and closure rows cannot stand in for the employee answer',()=>{
 const run={runId:'r',eventId:1,ticketId:63,status:'completed' as const,step:4,completedSteps:4,startedAt:1,updatedAt:2};
 const nonAnswers=[
  message(12,{authorId:121,authorRole:'IT'}),message(13,{authorId:null,authorRole:'SYSTEM'}),
  message(14,{assistantRun:run}),message(15,{kind:'ASSISTANT_PROGRESS'}),message(16,{kind:'CLOSURE'}),
  message(17,{kind:'SYSTEM'}),message(18,{itStatusChange:'AI_RESUMED'}),message(19,{ticketStatusChange:'REOPENED'}),
 ];
 expect(helpQuestionReplySequence([message(10),...nonAnswers],ticket)).toBe(10);
});

test('another ticket or another USER author does not resolve this owner question',()=>{
 expect(helpQuestionReplySequence([message(12,{ticketId:74}),message(13,{authorId:99})],ticket)).toBe(0);
 expect(helpQuestionReplySequence([message(12)],null)).toBe(0);
});

test('attachments and explicit questionnaire skips count as real submitted replies',()=>{
 const file={id:'image',name:'Screenshot.png',mimeType:'image/png',size:10,kind:'IMAGE' as const,url:'/image'};
 expect(helpQuestionReplySequence([message(12,{text:'',attachments:[file]})],ticket)).toBe(12);
 expect(helpQuestionReplySequence([message(13,{text:'Какая ОС?\nВопрос пропущен пользователем.'})],ticket)).toBe(13);
 expect(helpQuestionReplySequence([message(14,{text:'  '})],ticket)).toBe(0);
});

test('ticket summary supplies a real owner answer outside the loaded history window',()=>{
 expect(helpQuestionReplySequence([message(3)],{...ticket,lastMessage:message(15)})).toBe(15);
 expect(helpQuestionReplySequence([message(3)],{...ticket,lastMessage:message(16,{authorId:121,authorRole:'IT'})})).toBe(3);
 expect(helpQuestionReplySequence([message(3)],{...ticket,lastMessage:message(17,{ticketId:74})})).toBe(3);
});

test('invalid and optimistic sequence values are not evidence of a committed reply',()=>{
 for(const sequence of [NaN,Infinity,-1,0,1.5])expect(helpQuestionReplySequence([message(sequence)],ticket)).toBe(0);
});
