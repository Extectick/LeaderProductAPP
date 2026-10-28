import { Platform } from 'react-native';
let mockBase = 'https://api-a.test';
const mockValues = new Map<string,string>(), mockFiles = new Map<string,{size:number;isDirectory?:boolean}>();
const mockCopy = jest.fn(async ({from,to}:{from:string;to:string}) => { if(!mockFiles.has(from))throw new Error('missing');mockFiles.set(to,mockFiles.get(from)!); });
const mockDelete = jest.fn(async(uri:string)=>{mockFiles.delete(uri);});
jest.mock('../utils/config',()=>({get API_BASE_URL(){return mockBase;}}));
jest.mock('@react-native-async-storage/async-storage',()=>({getItem:jest.fn(async(key:string)=>mockValues.get(key)??null),setItem:jest.fn(async(key:string,value:string)=>{mockValues.set(key,value);}),removeItem:jest.fn(async(key:string)=>{mockValues.delete(key);}),getAllKeys:jest.fn(async()=>[...mockValues.keys()]),multiGet:jest.fn(async(keys:string[])=>keys.map(key=>[key,mockValues.get(key)??null]))}));
jest.mock('expo-file-system/legacy',()=>({documentDirectory:'file://documents/',makeDirectoryAsync:jest.fn(async()=>{}),getInfoAsync:jest.fn(async(uri:string)=>mockFiles.has(uri)?{exists:true,...mockFiles.get(uri)}:{exists:false}),copyAsync:(arg:any)=>mockCopy(arg),deleteAsync:(uri:string)=>mockDelete(uri)}));
import { clearHelpAttachmentDraft, holdHelpAttachmentFiles, loadHelpAttachmentDraft, saveHelpAttachmentDraft } from '../src/features/help/helpAttachmentDrafts';
const local=(uri='content://photo',name='Фото.jpg')=>({uri,name,mimeType:'image/jpeg',width:600,height:800,size:100,assetId:'asset-1'});
beforeEach(()=>{mockBase='https://api-a.test';mockValues.clear();mockFiles.clear();mockCopy.mockClear();mockDelete.mockClear();jest.replaceProperty(Platform,'OS','android');});
afterEach(()=>jest.restoreAllMocks());
test('temporary picker URIs become durable app-owned files and retain metadata/order',async()=>{
  mockFiles.set('content://photo',{size:100});mockFiles.set('file://cache/b.pdf',{size:200});
  const files=await saveHelpAttachmentDraft(5,'ticket:7',[local(),local('file://cache/b.pdf','b.pdf')]);
  expect(mockCopy).toHaveBeenCalledTimes(2);expect(files.map(file=>file.name)).toEqual(['Фото.jpg','b.pdf']);
  expect(files[0]).toMatchObject({width:600,height:800,size:100,assetId:'asset-1'});expect(files[0].uri).toMatch(/^file:\/\/documents\/help-drafts\/attachment-/);
  expect(await loadHelpAttachmentDraft(5,'ticket:7')).toEqual(files);
});
test('prepared owned photos are adopted without another copy; files are isolated by account, API and draft',async()=>{
  const file=local('file://documents/help-drafts/photo-abc-1.jpg');mockFiles.set(file.uri,{size:100});
  await saveHelpAttachmentDraft(5,'ticket:7',[file]);expect(mockCopy).not.toHaveBeenCalled();
  expect(await loadHelpAttachmentDraft(5,'ticket:7')).toEqual([file]);expect(await loadHelpAttachmentDraft(6,'ticket:7')).toEqual([]);expect(await loadHelpAttachmentDraft(5,'ticket:8')).toEqual([]);
  mockBase='https://api-b.test';expect(await loadHelpAttachmentDraft(5,'ticket:7')).toEqual([]);
});
test('cleanup preserves originals and any owned photo referenced by another manifest',async()=>{
  const file=local('file://documents/help-drafts/photo-abc-2.jpg');mockFiles.set(file.uri,{size:100});
  await saveHelpAttachmentDraft(5,'new:plain',[file]);await saveHelpAttachmentDraft(6,'ticket:7',[file]);
  await clearHelpAttachmentDraft(5,'new:plain');expect(mockFiles.has(file.uri)).toBe(true);
  await clearHelpAttachmentDraft(6,'ticket:7');expect(mockFiles.has(file.uri)).toBe(false);
  mockFiles.set('content://photo',{size:100});await saveHelpAttachmentDraft(5,'ticket:8',[local()]);await clearHelpAttachmentDraft(5,'ticket:8');expect(mockFiles.has('content://photo')).toBe(true);
});
test('in-flight send lease prevents clearing a file until upload releases it',async()=>{
  const file=local('file://documents/help-drafts/photo-abc-3.jpg');mockFiles.set(file.uri,{size:100});await saveHelpAttachmentDraft(5,'ticket:7',[file]);
  const release=holdHelpAttachmentFiles([file]);await clearHelpAttachmentDraft(5,'ticket:7');expect(mockFiles.has(file.uri)).toBe(true);
  release();release();await loadHelpAttachmentDraft(5,'ticket:7');expect(mockFiles.has(file.uri)).toBe(false);
});
test('serialized writes keep the latest manifest and never leave the previous copy',async()=>{
  mockFiles.set('content://a',{size:100});mockFiles.set('content://b',{size:100});
  const [a,b]=await Promise.all([saveHelpAttachmentDraft(5,'ticket:7',[local('content://a')]),saveHelpAttachmentDraft(5,'ticket:7',[local('content://b')])]);
  expect(await loadHelpAttachmentDraft(5,'ticket:7')).toEqual(b);expect(mockFiles.has(a[0].uri)).toBe(false);expect(mockFiles.has(b[0].uri)).toBe(true);
});
test('copy failure leaves the prior manifest intact and cleans partial app copies',async()=>{
  const old=local('file://documents/help-drafts/photo-abc-4.jpg');mockFiles.set(old.uri,{size:100});await saveHelpAttachmentDraft(5,'ticket:7',[old]);
  mockFiles.set('content://photo',{size:100});await expect(saveHelpAttachmentDraft(5,'ticket:7',[local(),local('missing://photo')])).rejects.toThrow('недоступен');
  expect(await loadHelpAttachmentDraft(5,'ticket:7')).toEqual([old]);expect([...mockFiles.keys()].filter(uri=>uri.includes('/attachment-'))).toEqual([]);
});
test('missing files are omitted and unsafe manifest paths never get deleted',async()=>{
  const file=local('file://documents/help-drafts/photo-abc-5.jpg');mockFiles.set(file.uri,{size:100});await saveHelpAttachmentDraft(5,'ticket:7',[file]);mockFiles.delete(file.uri);
  expect(await loadHelpAttachmentDraft(5,'ticket:7')).toEqual([]);
  const key=[...mockValues.keys()][0];mockValues.set(key,JSON.stringify({version:1,files:[local('file://documents/help-drafts/../private.jpg')]}));
  await clearHelpAttachmentDraft(5,'ticket:7');expect(mockDelete).not.toHaveBeenCalledWith('file://documents/help-drafts/../private.jpg');
});
test('oversized files and more than10 items fail without replacing a saved draft',async()=>{
  mockFiles.set('content://photo',{size:21*1024*1024});await expect(saveHelpAttachmentDraft(5,'ticket:7',[local()])).rejects.toThrow('20 МБ');
  await expect(saveHelpAttachmentDraft(5,'ticket:7',Array(11).fill(local()))).rejects.toThrow('10 файлов');expect(mockValues.size).toBe(0);
});
test('web keeps File metadata in memory without writing native manifests or filesystem paths',async()=>{
  jest.replaceProperty(Platform,'OS','web');const file=local('blob:browser');expect(await saveHelpAttachmentDraft(5,'ticket:7',[file])).toEqual([file]);
  expect(mockCopy).not.toHaveBeenCalled();expect(mockValues.size).toBe(0);expect(await loadHelpAttachmentDraft(5,'ticket:7')).toEqual([]);
});
