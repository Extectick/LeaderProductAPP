import {restorePendingPushResponse} from '../utils/pushResponseRestore';

test('notification survives an account/profile gate and opens its exact target after restoration',async()=>{
  const target={ticketId:11,messageId:38,eventId:61,recipientUserId:1};let saved:typeof target|null=target,profileId:number|null=null;
  const open=jest.fn(),clear=jest.fn(async()=>{saved=null;});
  const dispatch=(value:typeof target)=>{if(value.recipientUserId!==profileId)return false;open(value);return true;};
  expect(await restorePendingPushResponse(async()=>saved,clear,dispatch,()=>true)).toBe(false);
  expect(clear).not.toHaveBeenCalled();profileId=1;
  expect(await restorePendingPushResponse(async()=>saved,clear,dispatch,()=>true)).toBe(true);
  expect(open).toHaveBeenCalledWith(target);expect(clear).toHaveBeenCalledTimes(1);
});

test('late response read from a disposed binding cannot consume the replacement binding target',async()=>{
  let resolve!:(value:{ticketId:number}|null)=>void,current=true;
  const read=new Promise<{ticketId:number}|null>(done=>{resolve=done;}),clear=jest.fn(async()=>{}),open=jest.fn(()=>true);
  const restored=restorePendingPushResponse(()=>read,clear,open,()=>current);
  current=false;resolve({ticketId:11});expect(await restored).toBe(false);
  expect(open).not.toHaveBeenCalled();expect(clear).not.toHaveBeenCalled();
});
