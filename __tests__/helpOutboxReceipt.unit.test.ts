jest.mock('../src/features/help/helpAttachmentDrafts',()=>({clearHelpAttachmentDraft:(...args:unknown[])=>mockClearFiles(...args)}));
const mockSend=jest.fn(),mockConfirm=jest.fn(),mockSave=jest.fn(),mockUpload=jest.fn(),mockClearFiles=jest.fn();
jest.mock('../src/features/help/helpApi',()=>({uploadHelpFiles:(...args:unknown[])=>mockUpload(...args),createHelpApi:()=>({send:mockSend,create:mockSend}),HelpApiError:class extends Error {status=500;}}));
jest.mock('../src/features/help/helpStorage',()=>({confirmHelpPending:(...args:unknown[])=>mockConfirm(...args),saveHelpPending:(...args:unknown[])=>mockSave(...args),helpRetryDelay:()=>1000}));
jest.mock('../utils/config',()=>({API_BASE_URL:'https://dev.example.test'}));
import {dispatchHelpPending} from '../src/features/help/helpOutbox';
const operation=(key:string)=>({key,ticketId:17,create:false,createdAt:1,input:{text:'QA',clientMessageId:key}});
beforeEach(()=>{mockUpload.mockReset();mockClearFiles.mockReset().mockResolvedValue(undefined);mockSend.mockReset();mockConfirm.mockReset().mockResolvedValue(undefined);mockSave.mockReset().mockResolvedValue(undefined);});

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

test('uploads run before the message request and concurrent retries share the upload',async()=>{
  let finish!:(value:any)=>void;mockUpload.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  mockSend.mockResolvedValue({ticket:{id:17},messages:[]});
  const file={uri:'file:///draft/photo.jpg',name:'photo.jpg',mimeType:'image/jpeg'};
  const item={...operation('upload-once'),localFiles:[file]};
  const first=dispatchHelpPending(1,item),second=dispatchHelpPending(1,item);
  await new Promise(resolve=>setImmediate(resolve));
  expect(mockUpload).toHaveBeenCalledTimes(1);expect(mockSend).not.toHaveBeenCalled();expect(mockClearFiles).not.toHaveBeenCalled();
  finish([{id:'uploaded-photo'}]);await Promise.all([first,second]);
  expect(mockSend).toHaveBeenCalledTimes(1);
  expect(mockSend).toHaveBeenCalledWith(17,expect.objectContaining({attachmentIds:['uploaded-photo'],clientMessageId:'upload-once'}));
  expect(mockClearFiles).toHaveBeenCalledWith(1,'outbox:upload-once');
});

test('retry resumes after the last durable uploaded file without losing the files',async()=>{
  const files=[{uri:'file:///a.pdf',name:'a.pdf'},{uri:'file:///b.pdf',name:'b.pdf'}];
  mockUpload.mockResolvedValueOnce([{id:'a'}]).mockRejectedValueOnce(new Error('offline'));
  await expect(dispatchHelpPending(1,{...operation('resume-files'),localFiles:files})).rejects.toThrow('offline');
  const retained=mockSave.mock.calls.at(-1)![1];
  expect(retained).toMatchObject({localFiles:files,uploadedFileIds:['a'],status:'queued'});expect(mockClearFiles).not.toHaveBeenCalled();
  mockUpload.mockResolvedValueOnce([{id:'b'}]);mockSend.mockResolvedValue({ticket:{id:17},messages:[]});
  await dispatchHelpPending(1,retained);
  expect(mockUpload.mock.calls.map(call=>call[0])).toEqual([[files[0]],[files[1]],[files[1]]]);
  expect(mockSend).toHaveBeenCalledWith(17,expect.objectContaining({attachmentIds:['a','b']}));
});

test('media geometry and voice duration survive the server receipt before inspection completes',async()=>{
 const item={...operation('media-metadata'),localFiles:[{uri:'file://photo.jpg',name:'photo.jpg',mimeType:'image/jpeg',width:600,height:800},{uri:'file://voice.m4a',name:'voice.m4a',mimeType:'audio/mp4',durationMs:4200}]};
 mockUpload.mockResolvedValueOnce([{id:'photo'}]).mockResolvedValueOnce([{id:'voice'}]);
 mockSend.mockResolvedValue({ticket:{id:17},messages:[{clientMessageId:'media-metadata',attachments:[{id:'photo'},{id:'voice'}]}]});
 const receipt=jest.fn();await dispatchHelpPending(1,item,receipt);
 expect(receipt.mock.calls[0][0].messages[0].attachments).toEqual([expect.objectContaining({id:'photo',width:600,height:800}),expect.objectContaining({id:'voice',durationMs:4200})]);
});
