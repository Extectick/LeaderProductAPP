import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Platform} from 'react-native';
import {useHelpMediaKeyboard} from '../src/features/help/useHelpMediaKeyboard';

test('photo arrows navigate outside editable fields; Modal retains Escape and submenus can suspend navigation',async()=>{
 jest.replaceProperty(Platform,'OS','web');
 const browser=globalThis as any,keys=['addEventListener','removeEventListener'],saved=keys.map(key=>browser[key]);
 let keydown:(event:any)=>void=()=>{};const next=jest.fn(),previous=jest.fn();
 browser.addEventListener=jest.fn((type:string,listener:any)=>{if(type==='keydown')keydown=listener;});browser.removeEventListener=jest.fn();
 function Probe({enabled=true}:{enabled?:boolean}){useHelpMediaKeyboard(previous,next,enabled);return null;}
 let view!:Renderer.ReactTestRenderer;
 const event=(key:string,editable=false)=>({key,preventDefault:jest.fn(),stopPropagation:jest.fn(),target:{closest:()=>editable?{}:null}});
 try{
  await act(async()=>{view=Renderer.create(React.createElement(Probe));});
  const right=event('ArrowRight');keydown(right);keydown(event('ArrowLeft'));
  expect(next).toHaveBeenCalledTimes(1);expect(previous).toHaveBeenCalledTimes(1);expect(right.preventDefault).toHaveBeenCalled();
  keydown(event('ArrowRight',true));keydown({...event('ArrowRight'),ctrlKey:true});
  expect(next).toHaveBeenCalledTimes(1);
  const escape=event('Escape');keydown(escape);expect(escape.preventDefault).not.toHaveBeenCalled();
  await act(async()=>view.update(React.createElement(Probe,{enabled:false})));
  expect(browser.removeEventListener).toHaveBeenCalledWith('keydown',expect.any(Function));
 }finally{await act(async()=>view?.unmount());keys.forEach((key,index)=>{if(saved[index]===undefined)delete browser[key];else browser[key]=saved[index];});jest.restoreAllMocks();}
});
