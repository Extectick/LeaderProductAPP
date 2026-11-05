import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {StyleSheet,Text} from 'react-native';
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:'light'})}));
jest.mock('../src/features/help/helpDiagnostics',()=>({helpDevRef:jest.fn()}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('expo-blur',()=>({BlurTargetView:'BlurTargetView'}));
jest.mock('../src/features/help/components/HelpPrimitives',()=>({HelpIcon:'HelpIcon',HelpBlurSurface:'HelpBlurSurface'}));
jest.mock('../src/features/entityCards/entityCardActions',()=>({copyEntityCardLink:jest.fn(async()=>{})}));
import {HelpHeaderFrame,helpHeaderFrameHeight} from '../src/features/help/components/HelpHeaderFrame';
import {HelpChatHeader,HelpMoreCloseButton} from '../src/features/help/components/HelpChatHeader';
import {HelpViewerLayout,HELP_VIEWER_HEADER_HEIGHT} from '../src/features/help/components/HelpViewerLayout';
import {HelpHeaderOverlay} from '../src/features/help/components/HelpHeaderOverlay';
import {EntityCardViewer} from '../src/features/entityCards/EntityCardViewer';

test('chat and viewing surface render the same header frame and menu control with their own content',async()=>{
 const back=jest.fn(),choose=jest.fn();let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(React.createElement(React.Fragment,null,
  React.createElement(HelpChatHeader,{title:'Диалог',meta:'Сегодня',number:50,onBack:back,onMenu:choose}),
  React.createElement(HelpViewerLayout,{testIDPrefix:'example',onBack:back,actions:[{id:'link',label:'Ссылка',icon:'link-outline',onPress:choose}],children:React.createElement(Text,null,'Карточка')})));
 });
 try{
  const frames=view.root.findAllByType(HelpHeaderFrame);expect(frames).toHaveLength(2);
  expect(frames[0].props.title).toBeUndefined();expect(frames[1].props.title).toBe('Помощь');
  expect(frames[1].props.contentSurface).toBe(frames[0].props.contentSurface);expect(HELP_VIEWER_HEADER_HEIGHT).toBe(helpHeaderFrameHeight(true));
  const controls=view.root.findAllByType(HelpMoreCloseButton);expect(controls).toHaveLength(2);expect(controls[1].props.morphToClose).toBe(false);
  const surfaces=frames.map(frame=>frame.findByProps({testID:'help-search-surface'}));
  expect(StyleSheet.flatten(surfaces[1].props.style).backgroundColor).toBe(StyleSheet.flatten(surfaces[0].props.style).backgroundColor);
  const button=()=>view.root.findAll(node=>node.props?.testID==='example-menu-button'&&node.props.accessibilityRole==='button'&&typeof node.props.onPress==='function')[0];
  await act(async()=>button().props.onPress());expect(button().props.accessibilityState.expanded).toBe(true);
  const action=view.root.findAll(node=>node.props?.testID==='example-link'&&typeof node.props.onPress==='function')[0];
  await act(async()=>action.props.onPress());expect(choose).toHaveBeenCalledTimes(1);expect(button().props.accessibilityState.expanded).toBe(false);
 }finally{await act(async()=>view.unmount());}
});
test('a linked profile mounts the real same viewer layout and header rather than a duplicate',async()=>{
 let view!:TestRenderer.ReactTestRenderer;const back=jest.fn();
 const state={account:'dev:121',session:1,sequence:1,closing:false,frames:[{key:1,kind:'entity' as const,target:{v:1 as const,source:'app' as const,kind:'user' as const,id:'121'},title:'Профиль сотрудника',scrollOffset:0}]};
 await act(async()=>{view=TestRenderer.create(React.createElement(EntityCardViewer,{state,userId:121,onBack:back,onClose:jest.fn(),children:React.createElement(Text,null,'Профиль')}));});
 try{
  expect(view.root.findByType(HelpViewerLayout).props.testIDPrefix).toBe('entity-card');
  expect(view.root.findByType(HelpHeaderOverlay).props.id).toBe('entity-card-viewer-header');
  const header=view.root.findByType(HelpHeaderFrame);expect(header.props.title).toBe('Профиль сотрудника');expect(header.props.contentSurface).toBeUndefined();
  await act(async()=>header.props.onBack());expect(back).toHaveBeenCalledTimes(1);
 }finally{await act(async()=>view.unmount());}
});

test('page titles replace the generic label and long object names stay bounded',async()=>{
 const title='Молоко PARMALAT '+ 'очень длинное описание '.repeat(12);let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpViewerLayout,{title,onBack:jest.fn(),children:React.createElement(Text,null,title)}));});
 try{const value=view.root.findByType(HelpHeaderFrame).props.title;expect(value).toContain('Молоко PARMALAT');expect(Array.from(value).length).toBeLessThanOrEqual(44);expect(value.endsWith('…')).toBe(true);expect(view.root.findAllByType(Text).some(node=>node.props.children===title)).toBe(true);}
 finally{await act(async()=>view.unmount());}
});
