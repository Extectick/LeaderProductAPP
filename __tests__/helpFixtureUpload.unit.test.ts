import { Platform } from 'react-native';
const mockFiles = new Map<string,string>(), mockCopy = jest.fn(async({from,to}:any)=>{if(!mockFiles.has(from))throw new Error('missing');mockFiles.set(to,mockFiles.get(from)!);});
jest.mock('expo-file-system/legacy',()=>({cacheDirectory:'file://cache/',makeDirectoryAsync:jest.fn(async()=>{}),copyAsync:(args:any)=>mockCopy(args)}));
jest.mock('../qa/help-preview/HelpPreview',()=>({fixtures:[],message:jest.fn(),OWNER:{id:1},IT:{id:2},resolve:jest.fn()}));
jest.mock('../src/features/help/helpDiagnostics',()=>({helpDevActions:jest.fn(),helpDevState:jest.fn()}));
import { uploadFixtureAttachment } from '../qa/help-preview/serviceFixture';
beforeEach(()=>{mockFiles.clear();mockCopy.mockClear();});
afterEach(()=>jest.restoreAllMocks());
test('native fixture upload owns an independent copy and keeps image geometry after draft deletion',async()=>{
  jest.replaceProperty(Platform,'OS','android');const uri='file://documents/help-drafts/photo-abc-1.jpg';mockFiles.set(uri,'pixels');
  const attachment=await uploadFixtureAttachment({uri,name:'Фото.jpg',mimeType:'image/jpeg',size:123,width:600,height:800});
  expect(attachment).toMatchObject({kind:'IMAGE',width:600,height:800,size:123});expect(attachment.url).toMatch(/^file:\/\/cache\/help-qa-uploads\/local-/);
  mockFiles.delete(uri);expect(mockFiles.get(attachment.url)).toBe('pixels');expect(mockCopy).toHaveBeenCalledTimes(1);
  mockFiles.set(uri,'pixels');const second=await uploadFixtureAttachment({uri,name:'Фото.jpg'});expect(second.id).not.toBe(attachment.id);expect(second.url).not.toBe(attachment.url);
});
test('web fixture preserves its browser source without native IO',async()=>{
  jest.replaceProperty(Platform,'OS','web');const attachment=await uploadFixtureAttachment({uri:'blob:fixture',name:'a.png',mimeType:'image/png',width:10,height:20});
  expect(attachment.url).toBe('blob:fixture');expect(mockCopy).not.toHaveBeenCalled();
});
