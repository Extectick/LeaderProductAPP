import {parseHelpPush} from '../src/features/help/helpPush';
import {helpNotificationRoute} from '../src/features/help/helpNotificationPolicy';
import {NotificationDeadlines} from '../utils/notificationDeadlines';
import {publishHelpActivity,readHelpActivity} from '../src/features/help/helpActivity';
test('notification route suppresses only the actual open ticket in an active application',()=>{
  expect(helpNotificationRoute(true,1043,1043)).toBe('chat');
  expect(helpNotificationRoute(true,1042,1043)).toBe('banner');
  expect(helpNotificationRoute(true,null,1043)).toBe('banner');
  expect(helpNotificationRoute(false,1043,1043)).toBe('ignore');
});
test('push target preserves the exact message and event across navigation',()=>{
  expect(parseHelpPush({type:'HELP_MESSAGE',ticketId:'1043',messageId:'7001',eventId:'90'})).toEqual({ticketId:1043,messageId:7001,eventId:90});
  expect(parseHelpPush({type:'HELP_MESSAGE',ticketId:-1})).toBeNull();
});
test('a held banner resumes its remaining deadline and replacement cancels the old deadline',()=>{
  jest.useFakeTimers();const expire=jest.fn(),timer=new NotificationDeadlines(expire);
  try{
    timer.start('event',5000);jest.advanceTimersByTime(2000);timer.pause('event');jest.advanceTimersByTime(10000);expect(expire).not.toHaveBeenCalled();
    timer.resume('event');jest.advanceTimersByTime(2999);expect(expire).not.toHaveBeenCalled();jest.advanceTimersByTime(1);expect(expire).toHaveBeenCalledWith('event');
    timer.start('replace',1000);jest.advanceTimersByTime(500);timer.start('replace',2000);jest.advanceTimersByTime(1000);expect(expire).toHaveBeenCalledTimes(1);jest.advanceTimersByTime(1000);expect(expire).toHaveBeenCalledTimes(2);
  }finally{timer.clear();jest.useRealTimers();}
});
test('stale screen cleanup does not clear a newer activity publication',()=>{
  const owner={},old=publishHelpActivity(owner,{userId:5,ticketId:1042});const current=publishHelpActivity(owner,{userId:5,ticketId:1043});old();expect(readHelpActivity(5)).toBe(1043);expect(readHelpActivity(6)).toBeNull();current();expect(readHelpActivity(5)).toBeNull();
});

import {matchingPendingCreate} from '../src/features/help/helpPendingCreate';
test('a persisted create blocks resubmitting the same draft but permits a different problem',()=>{const item={create:true,input:{text:'Printer',sourceTicketId:7},key:'same'};expect(matchingPendingCreate([item],' Printer ',7)).toBe(item);expect(matchingPendingCreate([item],'Other problem',7)).toBeUndefined();expect(matchingPendingCreate([item],'Printer',8)).toBeUndefined();});
