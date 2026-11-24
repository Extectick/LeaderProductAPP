import {helpRequest} from '../helpApi';
import type {Draft, Report, Run, SavedTask} from './model';

export type ServerTask = SavedTask & {ticketId:number;messageId:number;hasMoreRuns:boolean};
export type ScheduleList = {
  tasks:ServerTask[];activeTaskCount:number;unreadTaskCount:number;
  decisions:Record<string,'cancelled'|'deleted'>;
};
export type RunPage<T> = {runs:T[];hasMore:boolean};

export function scheduleApi(userId:number) {
  const request = <T,>(path:string,method:'GET'|'POST'|'PATCH'|'DELETE'='GET',body?:unknown) =>
    helpRequest<T>('/schedules'+path,method,body,userId);
  const taskPath = (id:string) => '/'+encodeURIComponent(id);
  const cursor = (before?:string) => before ? '?before='+encodeURIComponent(before) : '';
  return {
    list:()=>request<ScheduleList>(''),
    add:(ticketId:number,messageId:number,draft:Draft)=>request<ServerTask>('','POST',{ticketId,messageId,...draft}),
    cancel:(ticketId:number,messageId:number)=>request('/cancel','POST',{ticketId,messageId}),
    update:(id:string,changes:Partial<Draft> & {active?:boolean})=>request<ServerTask>(taskPath(id),'PATCH',changes),
    remove:(id:string)=>request(taskPath(id),'DELETE'),
    check:(id:string,requestId:string)=>request(taskPath(id)+'/run','POST',{requestId}),
    runs:(id:string,before:string)=>request<RunPage<Run>>(taskPath(id)+'/runs'+cursor(before)),
    reports:(before?:string)=>request<RunPage<Report>>('/reports'+cursor(before)),
    read:(ids:string[])=>request('/read','POST',{ids}),
  };
}
