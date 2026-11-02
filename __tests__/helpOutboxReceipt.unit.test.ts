const mockSend=jest.fn(),mockConfirm=jest.fn(),mockSave=jest.fn();
jest.mock('../src/features/help/helpApi',()=>({createHelpApi:()=>({send:mockSend}),HelpApiError:class extends Error {status=500;}}));
jest.mock('../src/features/help/helpStorage',()=>({confirmHelpPending:(...args:unknown[])=>mockConfirm(...args),saveHelpPending:(...args:unknown[])=>mockSave(...args),helpRetryDelay:()=>1000}));
jest.mock('../utils/config',()=>({API_BASE_URL:'https://dev.example.test'}));
import {dispatchHelpPending} from '../src/features/help/helpOutbox';
const operation=(key:string)=>({key,ticketId:17,create:false,createdAt:1,input:{text:'QA',clientMessageId:key}});
beforeEach(()=>{mockSend.mockReset();mockConfirm.mockReset().mockResolvedValue(undefined);mockSave.mockReset().mockResolvedValue(undefined);});

test('receipt follows server acceptance without waiting for disk acknowledgement',async()=>{
  let persist!:()=>void;mockConfirm.mockReturnValue(new Promise<void>(resolve=>{persist=resolve;}));
  const detail={ticket:{id:17},messages:[]};mockSend.mockResolvedValue(detail);
  const receipt=jest.fn(),completed=jest.fn();
  const work=dispatchHelpPending(1,operation('receipt'),receipt).then(completed);
  await new Promise(resolve=>setImmediate(resolve));
  expect(receipt).toHaveBeenCalledWith(detail);expect(completed).not.toHaveBeenCalled();
  persist();await work;expect(completed).toHaveBeenCalledWith(detail);
});

test('failed requests retain retry data and never paint a delivered receipt',async()=>{
  mockSend.mockRejectedValue(new Error('offline'));const receipt=jest.fn();
  await expect(dispatchHelpPending(1,operation('offline'),receipt)).rejects.toThrow('offline');
  expect(receipt).not.toHaveBeenCalled();expect(mockConfirm).not.toHaveBeenCalled();
  expect(mockSave).toHaveBeenLastCalledWith(1,expect.objectContaining({key:'offline',status:'queued',attempts:1}));
});

test('UI observer failure cannot interrupt durable confirmation or trigger retry',async()=>{
  mockSend.mockResolvedValue({ticket:{id:17},messages:[]});
  await dispatchHelpPending(1,operation('observer'),()=>{throw Error('unmounted view');});
  expect(mockConfirm).toHaveBeenCalledTimes(1);expect(mockSave).toHaveBeenCalledTimes(1);
});
