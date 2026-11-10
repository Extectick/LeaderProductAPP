import {Platform} from 'react-native';
import {Blob as NodeBlob} from 'node:buffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {downloadHelpAttachment} from '../src/features/help/helpAttachmentDownload';
import type {HelpAttachment} from '../src/features/help/helpApi';

jest.mock('expo-file-system/legacy',()=>({cacheDirectory:'file://cache/',createDownloadResumable:jest.fn(),getInfoAsync:jest.fn(),deleteAsync:jest.fn(async()=>{})}));
jest.mock('expo-sharing',()=>({isAvailableAsync:jest.fn(),shareAsync:jest.fn(async()=>{})}));
const file:HelpAttachment={id:'file-1',name:'Отчёт.xlsx',kind:'FILE',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',size:100,url:'/private-file'};
const source={uri:'https://fixture.invalid/private-file',headers:{Authorization:'Bearer synthetic-test-only'}};
const original={os:Platform.OS,fetch:globalThis.fetch,blob:globalThis.Blob,document:globalThis.document,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
let callback:(value:{totalBytesWritten:number;totalBytesExpectedToWrite:number})=>void;
let task:{downloadAsync:jest.Mock;cancelAsync:jest.Mock};
beforeEach(()=>{
 jest.clearAllMocks();Platform.OS='android';
 task={downloadAsync:jest.fn(async()=>({status:200,uri:'file://cache/received'})),cancelAsync:jest.fn(async()=>{})};
 (FileSystem.createDownloadResumable as jest.Mock).mockImplementation((_uri,_path,_options,progress)=>{callback=progress;return task;});
 (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({exists:true,size:100});
 (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
});
afterEach(()=>{
 Platform.OS=original.os;globalThis.fetch=original.fetch;globalThis.Blob=original.blob;globalThis.document=original.document;
 URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;jest.restoreAllMocks();jest.useRealTimers();
});
const deferred=<T,>()=>{let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

test('native transfer uses authenticated resumable bytes, bounds updates and completes with actual local size',async()=>{
 const result=deferred<any>();task.downloadAsync.mockReturnValue(result.promise);
 let now=0;jest.spyOn(Date,'now').mockImplementation(()=>now);const progress=jest.fn(),resolve=jest.fn(async()=>source);
 const done=downloadHelpAttachment(file,resolve,undefined,progress);await flush();
 expect(FileSystem.createDownloadResumable).toHaveBeenCalledWith(source.uri,expect.stringContaining('file://cache/help-file-1-'),{headers:source.headers},expect.any(Function));
 now=101;callback({totalBytesWritten:30,totalBytesExpectedToWrite:100});
 now=120;callback({totalBytesWritten:40,totalBytesExpectedToWrite:100});
 now=202;callback({totalBytesWritten:75,totalBytesExpectedToWrite:100});
 expect(progress.mock.calls.map(([value])=>value)).toEqual([{downloaded:0,total:100},{downloaded:30,total:100},{downloaded:75,total:100}]);
 result.resolve({status:200,uri:'file://cache/received'});await done;
 expect(progress).toHaveBeenLastCalledWith({downloaded:100,total:100});
 expect(Sharing.shareAsync).toHaveBeenCalledWith('file://cache/received',{mimeType:file.mimeType,dialogTitle:'Сохранить файл'});
 expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
 expect(task.cancelAsync).toHaveBeenCalledTimes(1);
});

test('abort interrupts native work, cleans only its unique path, suppresses late progress and never shares',async()=>{
 const result=deferred<any>();task.downloadAsync.mockReturnValue(result.promise);
 const controller=new AbortController(),progress=jest.fn();
 const done=downloadHelpAttachment(file,async()=>source,controller.signal,progress);const failed=expect(done).rejects.toMatchObject({name:'AbortError'});await flush();
 const path=(FileSystem.createDownloadResumable as jest.Mock).mock.calls[0][1];controller.abort();await failed;
 expect(task.cancelAsync).toHaveBeenCalledTimes(1);expect(FileSystem.deleteAsync).toHaveBeenCalledWith(path,{idempotent:true});
 const count=progress.mock.calls.length;callback({totalBytesWritten:100,totalBytesExpectedToWrite:100});result.resolve({status:200,uri:path});await flush();
 expect(progress).toHaveBeenCalledTimes(count);expect(Sharing.shareAsync).not.toHaveBeenCalled();
 await downloadHelpAttachment(file,async()=>source);
 expect((FileSystem.createDownloadResumable as jest.Mock).mock.calls[1][1]).not.toBe(path);
});

test.each(['resolve','share-readiness'])('abort during %s cannot start a later download/share',async phase=>{
 const pending=deferred<any>(),controller=new AbortController();
 const resolve=phase==='resolve'?()=>pending.promise:async()=>source;
 if(phase==='share-readiness')(Sharing.isAvailableAsync as jest.Mock).mockReturnValue(pending.promise);
 const done=downloadHelpAttachment(file,resolve,controller.signal);const failed=expect(done).rejects.toMatchObject({name:'AbortError'});await flush();controller.abort();await failed;
 pending.resolve(phase==='resolve'?source:true);await flush();
 if(phase==='resolve')expect(FileSystem.createDownloadResumable).not.toHaveBeenCalled();
 expect(Sharing.shareAsync).not.toHaveBeenCalled();
});

test('native failures clean their partial file and preserve retry; unavailable size does not break sharing',async()=>{
 task.downloadAsync.mockRejectedValueOnce(Error('network failure'));
 await expect(downloadHelpAttachment(file,async()=>source)).rejects.toThrow('network failure');
 expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);expect(Sharing.shareAsync).not.toHaveBeenCalled();
 (FileSystem.getInfoAsync as jest.Mock).mockRejectedValueOnce(Error('no metadata'));
 await downloadHelpAttachment(file,async()=>source,undefined,()=>{throw Error('detached observer');});
 expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
});

function web(){
 Platform.OS='web';globalThis.Blob=NodeBlob as any;
 const click=jest.fn(),link={href:'',download:'',click};globalThis.document={createElement:jest.fn(()=>link)} as any;
 URL.createObjectURL=jest.fn(()=>'blob:fixture');URL.revokeObjectURL=jest.fn();jest.useFakeTimers();return {click,link};
}
test('web streams real chunk sizes with auth and releases its blob URL',async()=>{
 const {click,link}=web();let index=0;
 const reader={read:jest.fn(async()=>++index===1?{done:false,value:new Uint8Array([1,2,3])}:index===2?{done:false,value:new Uint8Array([4,5])}:{done:true}),releaseLock:jest.fn(),cancel:jest.fn(async()=>{})};
 globalThis.fetch=jest.fn(async()=>({ok:true,headers:{get:(key:string)=>key==='content-length'?'5':'application/octet-stream'},body:{getReader:()=>reader}})) as any;
 const progress=jest.fn();await downloadHelpAttachment({...file,size:0},async()=>source,undefined,progress);
 expect(globalThis.fetch).toHaveBeenCalledWith(source.uri,{headers:source.headers});expect(progress).toHaveBeenLastCalledWith({downloaded:5,total:5});
 expect(reader.releaseLock).toHaveBeenCalledTimes(1);expect(click).toHaveBeenCalledTimes(1);expect(link.download).toBe(file.name);
 jest.advanceTimersByTime(60000);expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture');
});

test('web unknown totals stay unknown while reading; abort cancels the reader without creating a download',async()=>{
 const {click}=web(),chunk=deferred<any>(),controller=new AbortController();
 const reader={read:jest.fn(()=>chunk.promise),releaseLock:jest.fn(),cancel:jest.fn(async()=>{})};
 globalThis.fetch=jest.fn(async()=>({ok:true,headers:{get:()=>null},body:{getReader:()=>reader}})) as any;
 const progress=jest.fn(),done=downloadHelpAttachment({...file,size:0},async()=>source,controller.signal,progress);
 const failed=expect(done).rejects.toMatchObject({name:'AbortError'});await flush();controller.abort();await failed;
 expect(progress.mock.calls[0][0]).toEqual({downloaded:0,total:null});expect(reader.cancel).toHaveBeenCalledTimes(1);expect(reader.releaseLock).toHaveBeenCalledTimes(1);
 expect(URL.createObjectURL).not.toHaveBeenCalled();expect(click).not.toHaveBeenCalled();chunk.resolve({done:true});
});

test('web blob-only fallback reports completed bytes without simulating intermediate percentages',async()=>{
 const {click}=web();globalThis.fetch=jest.fn(async()=>({ok:true,headers:{get:()=>null},blob:async()=>new NodeBlob(['abc'])})) as any;
 const progress=jest.fn();await downloadHelpAttachment({...file,size:0},async()=>source,undefined,progress);
 expect(progress.mock.calls.map(([value])=>value)).toEqual([{downloaded:0,total:null},{downloaded:3,total:3}]);expect(click).toHaveBeenCalledTimes(1);
});
