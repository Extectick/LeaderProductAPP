/** @jest-environment jsdom */
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
// Keep the actual renderers: RN-web maps accessibilityRole to real <button>,
// and SVG web preparation is where the malformed transform-origin was emitted.
jest.mock('react-native',()=>jest.requireActual('react-native-web'));
jest.mock('react-native-svg',()=>jest.requireActual('react-native-svg/lib/commonjs/elements.web'));
jest.mock('@expo/vector-icons',()=>({MaterialCommunityIcons:()=>null}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({dark:false,text:'#222',muted:'#666',accent:'#38f',line:'#ddd',danger:'#b33',elevated:'#eef'})}));
import {HelpFileRow,type HelpFileRowProps} from '../src/features/help/components/HelpFileRow';

const file:any={id:'sheet',name:'Склад.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',size:2048,kind:'FILE',url:'/file'};
let container:HTMLDivElement,root:Root,errorSpy:jest.Mock;
const render=(props:Partial<HelpFileRowProps>={})=>act(async()=>root.render(React.createElement(HelpFileRow,{file,state:'idle',testID:'attachment',onPress:jest.fn(),...props})));
const row=()=>container.querySelector('[data-testid="attachment"]')! as HTMLElement;
const cancel=()=>container.querySelector('[data-testid="attachment-cancel"]') as HTMLButtonElement|null;
beforeEach(()=>{
 container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
 errorSpy=console.error as jest.Mock;errorSpy.mockImplementation(()=>{});
});
afterEach(async()=>{
 await act(async()=>root.unmount());container.remove();
 // This must fail on React nesting and unknown-property warnings rather than
 // silencing the LogBox symptoms. Any other render error also deserves attention.
 expect(errorSpy).not.toHaveBeenCalled();
});

test.each(['message','assistant'] as const)('%s busy download has a reachable cancel button outside any other button',async variant=>{
 const onPress=jest.fn(),onCancel=jest.fn();
 await render({variant,state:'busy',progress:{downloaded:512,total:2048},onPress,onCancel});
 expect(container.querySelector('button button')).toBeNull();
 expect((row() as HTMLButtonElement).disabled).toBe(true);
 const button=cancel()!;expect(button).not.toBeNull();expect(button.tagName).toBe('BUTTON');
 expect(button.disabled).toBe(false);expect(button.tabIndex).toBe(0);expect(button.closest('button')).toBe(button);
 expect(button.parentElement?.closest('button')).toBeNull();
 await act(async()=>button.focus());expect(document.activeElement).toBe(button);
 await act(async()=>row().click());expect(onPress).not.toHaveBeenCalled();expect(onCancel).not.toHaveBeenCalled();
 await act(async()=>button.click());expect(onCancel).toHaveBeenCalledTimes(1);expect(onPress).not.toHaveBeenCalled();
 const progress=container.querySelector('[role="progressbar"]')!;
 expect(progress.getAttribute('aria-label')).toBe('Загрузка Склад.xlsx');
 const circles=container.querySelectorAll('svg circle');expect(circles).toHaveLength(2);
 expect(Number(circles[1].getAttribute('stroke-dashoffset'))).toBeCloseTo(2*Math.PI*26*.75);
 // The public progress update exercises the same mounted SVG node, not a mock.
 await render({variant,state:'busy',progress:{downloaded:1536,total:2048},onPress,onCancel});
 expect(container.querySelector('[data-testid="attachment-subtitle"]')!.textContent).toBe('1,5 КБ / 2 КБ');
 expect(Number(container.querySelectorAll('svg circle')[1].getAttribute('stroke-dashoffset'))).toBeCloseTo(2*Math.PI*26*.25);
});

test.each(['idle','ready','failed','cancelled'] as const)('%s file keeps a semantic keyboard-focusable download/retry action',async state=>{
 const onPress=jest.fn();await render({state,onPress,onCancel:jest.fn()});
 const button=container.querySelector('button')!;expect(button).not.toBeNull();expect(button.disabled).toBe(false);expect(button.tabIndex).toBe(0);
 expect(container.querySelectorAll('button')).toHaveLength(1);expect(cancel()).toBeNull();
 expect(button.getAttribute('aria-label')).toBe(state==='failed'||state==='cancelled'?'Повторить загрузку Склад.xlsx':'Скачать Склад.xlsx');
 await act(async()=>button.focus());expect(document.activeElement).toBe(button);
 // JSDOM does not synthesize a native button's click from keyboard activation.
 // Check its key events aren't blocked, then dispatch the browser's default click.
 for(const key of ['Enter',' ']){
  const event=new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});
  await act(async()=>button.dispatchEvent(event));expect(event.defaultPrevented).toBe(false);
  await act(async()=>button.click());
 }
 expect(onPress).toHaveBeenCalledTimes(2);
});

test('unknown progress remains cancellable; upload and disabled file expose no active download',async()=>{
 const onPress=jest.fn(),onCancel=jest.fn();
 await render({state:'busy',progress:{downloaded:512,total:null},onPress,onCancel});
 expect(container.querySelector('button button')).toBeNull();expect(cancel()!.disabled).toBe(false);
 expect(container.querySelector('[data-testid="attachment-progress"]')!.getAttribute('aria-valuenow')).toBeNull();
 await act(async()=>cancel()!.click());expect(onCancel).toHaveBeenCalledTimes(1);
 await render({state:'idle',uploading:true,onPress,onCancel});expect(cancel()).toBeNull();
 await act(async()=>row().click());expect(onPress).not.toHaveBeenCalled();
 await render({state:'idle',disabled:true,onPress,onCancel});expect(cancel()).toBeNull();
 await act(async()=>row().click());expect(onPress).not.toHaveBeenCalled();
});
