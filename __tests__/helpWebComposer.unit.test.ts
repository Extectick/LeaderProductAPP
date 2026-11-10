import React from 'react';
import {File as NodeFile} from 'node:buffer';
const makeFile=(parts:any[],name:string,options?:any)=>new NodeFile(parts,name,options) as unknown as File;
import TestRenderer, {act} from 'react-test-renderer';
import {Platform, View} from 'react-native';
import {HELP_ATTACHMENT_MAX_BYTES, HELP_WEB_SEND_MODE_KEY, helpAttachmentBatchError, helpTransferredFiles, shouldSendHelpWebKey} from '../src/features/help/helpWebComposer';
import {createHelpWebAttachment, holdHelpWebAttachments, releaseHelpWebAttachment} from '../src/features/help/helpWebAttachmentUrls';
import {useHelpWebComposer} from '../src/features/help/useHelpWebComposer';

describe('web keyboard submission policy', () => {
  test.each([
    [{key:'Enter'},'enter',true,true],
    [{key:'Enter'},'enter',false,false],
    [{key:'Enter'},'modifier',true,false],
    [{key:'Enter',ctrlKey:true},'modifier',true,true],
    [{key:'Enter',metaKey:true},'modifier',false,true],
    [{key:'Enter',shiftKey:true},'enter',true,false],
    [{key:'Enter',altKey:true},'enter',true,false],
    [{key:'Enter',ctrlKey:true,isComposing:true},'enter',true,false],
    [{key:'Enter',keyCode:229},'enter',true,false],
    [{key:'Enter',which:229},'enter',true,false],
    [{key:'Enter',repeat:true},'enter',true,false],
    [{key:'Enter',defaultPrevented:true},'enter',true,false],
  ] as const)('%j / %s / fine=%s => %s', (event,mode,fine,expected) => {
    expect(shouldSendHelpWebKey(event,mode,fine)).toBe(expected);
  });
  test('composition lifecycle also fences browsers with incomplete keyboard events',()=>{
    expect(shouldSendHelpWebKey({key:'Enter',ctrlKey:true},'enter',true,true)).toBe(false);
  });
  test('paste prefers FileList without duplicating clipboard items',()=>{
    const file=makeFile(['image'],'capture.png',{type:'image/png'});
    expect(helpTransferredFiles({files:[file],items:[{kind:'file',getAsFile:()=>file}]} as any)).toEqual([file]);
    expect(helpTransferredFiles({files:[],items:[{kind:'string',getAsFile:()=>null},{kind:'file',getAsFile:()=>file}]} as any)).toEqual([file]);
  });
  test('all file ingress shares exact count and byte limits',()=>{
    expect(helpAttachmentBatchError([{size:HELP_ATTACHMENT_MAX_BYTES}],9)).toBeNull();
    expect(helpAttachmentBatchError([{size:HELP_ATTACHMENT_MAX_BYTES+1}],0)).toContain('20 МБ');
    expect(helpAttachmentBatchError([{size:1}],10)).toContain('10 файлов');
  });
});

describe('web composer clipboard/drop and object URL ownership',()=>{
  let screen:TestRenderer.ReactTestRenderer|undefined,api:ReturnType<typeof useHelpWebComposer>,options:any,element:EventTarget;
  const originalPlatform=Platform.OS;
  const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  let browser:any;
  let nextUrl=0;
  const create=jest.fn(()=>`blob:help-test-${++nextUrl}`),revoke=jest.fn();
  const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
  function Harness({value}:{value:any}) {api=useHelpWebComposer(value);return React.createElement('div',{ref:api.root,testID:'drop-root'});}
  beforeEach(()=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
    URL.createObjectURL=create;URL.revokeObjectURL=revoke;create.mockClear();revoke.mockClear();
    const stored=new Map<string,string>();
    browser=Object.assign(new EventTarget(),{localStorage:{getItem:(key:string)=>stored.get(key)??null,setItem:(key:string,value:string)=>stored.set(key,value)},matchMedia:()=>({matches:true,addEventListener:jest.fn(),removeEventListener:jest.fn()})});
    Object.defineProperty(globalThis,'window',{configurable:true,value:browser});
    element=Object.assign(new EventTarget(),{contains:(node:any)=>node===element});
    options={files:[],existingCount:0,enabled:true,scope:'account:ticket',accept:jest.fn(()=>true),replace:jest.fn(),error:jest.fn()};
  });
  afterEach(async()=>{if(screen)await act(async()=>screen!.unmount());screen=undefined;if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;Object.defineProperty(Platform,'OS',{configurable:true,value:originalPlatform});});
  async function render(){await act(async()=>{screen=TestRenderer.create(React.createElement(Harness,{value:options}),{createNodeMock:n=>n.props.testID==='drop-root'?element:null});});}
  async function update(next:any){options={...options,...next};await act(async()=>screen!.update(React.createElement(Harness,{value:options})));}
  async function transfer(kind:'paste'|'drop'|'dragenter'|'dragleave',files:File[],relatedTarget?:Node){
    const event=new Event(kind,{bubbles:true,cancelable:true});
    Object.defineProperty(event,kind==='paste'?'clipboardData':'dataTransfer',{value:{files,items:[],types:files.length?['Files']:['text/plain']}});
    if(relatedTarget)Object.defineProperty(event,'relatedTarget',{value:relatedTarget});
    await act(async()=>{element.dispatchEvent(event);});return event;
  }
  test('pasted images keep the File, add a preview and never submit',async()=>{
    await render();const file=makeFile(['png'],'capture.png',{type:'image/png'}),event=await transfer('paste',[file]);
    expect(event.defaultPrevented).toBe(true);expect(options.accept).toHaveBeenCalledTimes(1);
    expect(options.accept.mock.calls[0][0][0]).toMatchObject({file,name:'capture.png',size:3,mimeType:'image/png',webObjectUrl:true});
    expect(revoke).not.toHaveBeenCalled();
  });
  test('text-only paste is not consumed',async()=>{
    await render();expect((await transfer('paste',[])).defaultPrevented).toBe(false);expect(options.accept).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();
  });
  test('rejected append releases all allocated preview URLs immediately',async()=>{
    options.accept.mockReturnValue(false);await render();await transfer('paste',[makeFile(['x'],'a.png'),makeFile(['y'],'b.png')]);
    expect(create).toHaveBeenCalledTimes(2);expect(revoke).toHaveBeenCalledTimes(2);
    await act(async()=>screen!.unmount());screen=undefined;expect(revoke).toHaveBeenCalledTimes(2);
  });
  test('failed URL allocation releases earlier files without publishing a partial batch',async()=>{
    create.mockImplementationOnce(()=>`blob:help-test-${++nextUrl}`).mockImplementationOnce(()=>{throw new Error('allocation unavailable');});
    await render();await transfer('drop',[makeFile(['x'],'a.png'),makeFile(['y'],'b.png')]);
    expect(options.accept).not.toHaveBeenCalled();expect(revoke).toHaveBeenCalledTimes(1);expect(options.error).toHaveBeenCalledTimes(1);
  });
  test('drop hint clears on exit and rejected oversize/count batches allocate no URLs',async()=>{
    await render();const file=makeFile(['x'],'report.txt');await transfer('dragenter',[file]);expect(api.dragging).toBe(true);
    await transfer('dragleave',[file]);expect(api.dragging).toBe(false);
    await transfer('drop',[{name:'large',size:HELP_ATTACHMENT_MAX_BYTES+1} as File]);expect(options.error).toHaveBeenLastCalledWith(expect.stringContaining('20 МБ'));
    await update({existingCount:10});await transfer('drop',[file]);expect(options.error).toHaveBeenLastCalledWith(expect.stringContaining('10 файлов'));
    expect(options.accept).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();
  });
  test('disabled input never attaches files; removing drop listeners prevents stale chat writes',async()=>{
    await render();const file=makeFile(['x'],'report.txt');await update({enabled:false});
    const event=await transfer('drop',[file]);expect(event.defaultPrevented).toBe(true);expect(options.accept).not.toHaveBeenCalled();
    await act(async()=>screen!.unmount());screen=undefined;
    expect((await transfer('paste',[file])).defaultPrevented).toBe(false);expect(create).not.toHaveBeenCalled();
  });
  test('URLs live until both removed draft and pending submission release them',async()=>{
    await render();await transfer('drop',[makeFile(['x'],'report.txt')]);const files=options.accept.mock.calls[0][0];
    await update({files});const release=holdHelpWebAttachments(files);
    await update({files:[]});expect(revoke).not.toHaveBeenCalled();
    release();release();expect(revoke).toHaveBeenCalledTimes(1);expect(revoke).toHaveBeenCalledWith(files[0].uri);
  });
  test('unmount frees preview URLs but leaves an upload-owned URL alive',async()=>{
    await render();await transfer('paste',[makeFile(['x'],'a.png',{type:'image/png'}),makeFile(['y'],'b.txt')]);const files=options.accept.mock.calls[0][0];
    await update({files});const release=holdHelpWebAttachments([files[0]]);
    await act(async()=>screen!.unmount());screen=undefined;expect(revoke.mock.calls).toEqual([[files[1].uri]]);
    release();expect(revoke).toHaveBeenCalledWith(files[0].uri);
  });
  test('restored draft gets a fresh preview without appending duplicate files',async()=>{
    const stale=createHelpWebAttachment(makeFile(['x'],'a.png',{type:'image/png'}));releaseHelpWebAttachment(stale.uri);revoke.mockClear();
    options.files=[stale];await render();
    expect(options.replace).toHaveBeenCalledTimes(1);expect(options.accept).not.toHaveBeenCalled();
    const next=options.replace.mock.calls[0][0];expect(next).toHaveLength(1);expect(next[0].file).toBe(stale.file);expect(next[0].uri).not.toBe(stale.uri);
    await update({files:next});expect(revoke).not.toHaveBeenCalled();
  });
  test('composition and send preference are tracked without changing draft text',async()=>{
    await render();await act(async()=>{element.dispatchEvent(new Event('compositionstart',{bubbles:true}));});expect(api.composing.current).toBe(true);
    await act(async()=>{element.dispatchEvent(new Event('compositionend',{bubbles:true}));});expect(api.composing.current).toBe(false);
    expect(api.finePointer).toBe(true);expect(api.sendMode).toBe('enter');await act(async()=>api.toggleSendMode());
    expect(api.sendMode).toBe('modifier');expect(window.localStorage.getItem(HELP_WEB_SEND_MODE_KEY)).toBe('modifier');expect(options.accept).not.toHaveBeenCalled();
  });
});
