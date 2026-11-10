import type {HelpMessage,HelpTicket} from './helpApi';
import {helpQuestions} from './helpQuestions';
import type {HelpAssistantQuestion} from './helpAssistant';
import type {HelpPending} from './helpDurableTypes';
import {helpPendingMessage} from './helpPendingPresentation';

/** Historical question status belongs to the requesting employee, not to the
 * person currently viewing the ticket. This is display evidence only: it must
 * not advance the questionnaire, change drafts or submit an answer. */
export function helpQuestionReplySequence(messages:readonly HelpMessage[],ticket:Pick<HelpTicket,'id'|'ownerId'|'lastMessage'>|null|undefined):number {
 if(!ticket)return 0;
 const replySequence=(message:HelpMessage|null|undefined)=>
  message&&message.ticketId===ticket.id&&message.authorId===ticket.ownerId&&message.authorRole==='USER'&&
  message.kind==='TEXT'&&!message.assistantRun&&!message.itStatusChange&&!message.ticketStatusChange&&
  (message.text.trim().length>0||message.attachments.length>0)&&Number.isSafeInteger(message.sequence)&&message.sequence>0
   ?message.sequence:0;
 // lastMessage is useful when inspecting an older, paged history window.
 return messages.reduce((latest,message)=>Math.max(latest,replySequence(message)),replySequence(ticket.lastMessage));
}

export type HelpQuestionHistoryAnswer = {questionId:string;question:string;answer:string;skipped:boolean};
export type HelpQuestionExchange = {message:HelpMessage;answers:HelpQuestionHistoryAnswer[]};

/** Decode only the complete questionnaire wire format. Ordinary replies, partial
 * answers and ambiguous repeated question boundaries stay ordinary messages. */
function questionHistoryAnswers(text:string,questions:HelpAssistantQuestion[]):HelpQuestionHistoryAnswer[]|null {
 const answers:HelpQuestionHistoryAnswer[]=[];
 let remaining=text;
 for(let index=0;index<questions.length;index++) {
  const question=questions[index],prefix=`${question.question}\n`;
  if(!remaining.startsWith(prefix))return null;
  remaining=remaining.slice(prefix.length);
  let body=remaining;
  if(index<questions.length-1) {
   const boundary=`\n\n${questions[index+1].question}\n`,at=remaining.indexOf(boundary);
   if(at<0||remaining.indexOf(boundary,at+boundary.length)>=0)return null;
   body=remaining.slice(0,at);remaining=remaining.slice(at+2);
  }
  const skipped=body==='Вопрос пропущен пользователем.';
  if(!skipped&&(!body.startsWith('Ответ: ')||!body.slice(7).trim()))return null;
  answers.push({questionId:question.id,question:question.question,answer:skipped?'':body.slice(7),skipped});
 }
 return answers;
}

/** Derive a visual exchange from persisted records; never rewrite history or
 * synthesize an answer. New clients persist replyToId. Older clients are accepted
 * only for the exact full questionnaire immediately following its AI message.
 * Incomplete pages remain standalone. The grouped renderer retains all reply
 * attachments, reactions and actions under their original message identity. */
export function helpQuestionExchanges(messages:readonly HelpMessage[],ownerId:number|undefined):Map<number,HelpQuestionExchange> {
 const result=new Map<number,HelpQuestionExchange>();
 if(!Number.isSafeInteger(ownerId)||!ownerId||ownerId<0)return result;
 const bySequence=new Map<string,HelpMessage|null>(),ids=new Set<number>(),duplicateIds=new Set<number>();
 for(const message of messages) {
  const key=`${message.ticketId}:${message.sequence}`;
  bySequence.set(key,bySequence.has(key)?null:message);
  if(ids.has(message.id))duplicateIds.add(message.id);
  ids.add(message.id);
 }
 for(const [index,question] of messages.entries()) {
  if(question.id<=0||!Number.isSafeInteger(question.id)||!Number.isSafeInteger(question.sequence)||question.sequence<=0||duplicateIds.has(question.id))continue;
  const questions=helpQuestions(question);
  if(!questions.length||bySequence.get(`${question.ticketId}:${question.sequence}`)!==question)continue;
  const answer=bySequence.get(`${question.ticketId}:${question.sequence+1}`);
  if(!answer||messages[index+1]!==answer||answer.id<=0||!Number.isSafeInteger(answer.id)||duplicateIds.has(answer.id)||answer.authorId!==ownerId||answer.authorRole!=='USER'
    ||answer.kind!=='TEXT'||answer.assistantRun||answer.itStatusChange||answer.ticketStatusChange||answer.forwardedFromId
    ||(answer.replyToId!=null&&answer.replyToId!==question.id))continue;
  const answers=questionHistoryAnswers(answer.text,questions);
  if(answers)result.set(question.id,{message:answer,answers});
 }
 return result;
}

export type HelpPendingQuestionExchange=HelpQuestionExchange&{pending:HelpPending};

/** Bind the local outbox to the same AI cell before server acknowledgement.
 * Only explicit reply IDs qualify. Pending data never supplies read sequences,
 * history anchors or a persisted answer and retains its retry/error controls. */
export function helpPendingQuestionExchanges(messages:readonly HelpMessage[],pending:readonly HelpPending[],ownerId:number|undefined):Map<number,HelpPendingQuestionExchange> {
 const result=new Map<number,HelpPendingQuestionExchange>();
 if(!Number.isSafeInteger(ownerId)||!ownerId||ownerId<0)return result;
 const accepted=new Set(messages.flatMap(message=>message.clientMessageId?[message.clientMessageId]:[]));
 const latest=new Map<number,HelpMessage>();
 for(const message of messages) {
  if(message.id>0&&message.sequence>0&&(!latest.has(message.ticketId)||latest.get(message.ticketId)!.sequence<message.sequence))latest.set(message.ticketId,message);
 }
 const candidates=new Map<number,HelpPending[]>();
 for(const item of pending) {
  if(accepted.has(item.input.clientMessageId||item.key)||item.create||item.action||item.input.forwardedFromId||!item.input.replyToId||!item.ticketId||!Number.isFinite(item.createdAt))continue;
  const question=latest.get(item.ticketId);
  if(!question||question.id!==item.input.replyToId)continue;
  const items=candidates.get(question.id)??[];items.push(item);candidates.set(question.id,items);
 }
 for(const question of latest.values()) {
  const items=candidates.get(question.id),questions=helpQuestions(question);
  if(!items||items.length!==1||!questions.length||messages.filter(message=>message.id===question.id).length!==1)continue;
  const item=items[0],answers=questionHistoryAnswers(item.input.text,questions);
  if(answers)result.set(question.id,{message:helpPendingMessage(item,ownerId),answers,pending:item});
 }
 return result;
}
