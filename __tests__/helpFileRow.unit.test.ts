import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {ActivityIndicator,StyleSheet,Text} from 'react-native';
let mockDark=false;
jest.mock('@expo/vector-icons',()=>({MaterialCommunityIcons:'FileFormatIcon'}));
jest.mock('react-native-svg',()=>({__esModule:true,default:'Svg',Circle:'Circle'}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({dark:mockDark,text:'#222',muted:'#666',accent:'#38f',line:'#ddd',danger:'#b33',elevated:'#eef'})}));
import {HelpFileRow} from '../src/features/help/components/HelpFileRow';
import {helpFileBytes,helpFileFormat,helpFileTransferText} from '../src/features/help/helpFilePresentation';

const file:any={id:'sheet',name:'Склад.XLSX',mimeType:'application/octet-stream',size:2*1048576,kind:'FILE',url:'/file'};
let view:TestRenderer.ReactTestRenderer;
afterEach(async()=>{if(view)await act(async()=>view.unmount());mockDark=false;});
const row=()=>view.root.findAll(n=>n.props.testID==='attachment'&&typeof n.props.onPress==='function'&&n.props.style!==undefined)[0];
const subtitle=()=>view.root.findAllByProps({testID:'attachment-subtitle'})[0].props.children;

test.each([
  ['Отчёт.XLSX','application/octet-stream','file-excel'],
  ['Письмо.doc','application/octet-stream','file-word'],
  ['Документ','application/vnd.openxmlformats-officedocument.wordprocessingml.document','file-word'],
  ['Данные','application/vnd.ms-excel','file-excel'],
  ['Инструкция.PDF','','file-pdf-box'],['Презентация.pptx','','file-powerpoint'],
  ['Фото.zip','','folder-zip'],['app.apk','','android'],['result.csv','','file-delimited'],
  ['result.json','','file-code'],['unknown.bin','application/octet-stream','file-document-outline'],
])('format icon uses extension or MIME for %s', (name,mime,icon)=>{
  expect(helpFileFormat(name,mime).icon).toBe(icon);
});

test('byte labels preserve zero, real totals and unknown transfer length',()=>{
  expect(helpFileBytes(0)).toBe('0 Б');expect(helpFileBytes(512)).toBe('512 Б');
  expect(helpFileTransferText({downloaded:512*1024,total:2*1048576})).toBe('512 КБ / 2 МБ');
  expect(helpFileTransferText({downloaded:0,total:2*1048576})).toBe('0 Б / 2 МБ');
  expect(helpFileTransferText({downloaded:1024,total:null})).toBe('1 КБ загружено');
});

test('download progress surrounds the format icon and preserves row geometry and trailing stamp',async()=>{
  const props={file,state:'idle' as const,testID:'attachment',onPress:jest.fn(),trailing:React.createElement(Text,{testID:'stamp'},'15:30')};
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpFileRow,props));});
  const geometry=StyleSheet.flatten(row().props.style);
  expect(geometry).toMatchObject({minHeight:64,gap:12});expect(subtitle()).toBe('2 МБ');
  expect(view.root.findByType('FileFormatIcon' as any).props.name).toBe('file-excel');
  expect(view.root.findAllByProps({testID:'stamp'}).length).toBeGreaterThan(0);
  await act(async()=>view.update(React.createElement(HelpFileRow,{...props,state:'busy',progress:{downloaded:512*1024,total:2*1048576}})));
  expect(StyleSheet.flatten(row().props.style)).toEqual(geometry);
  expect(row().props.accessibilityState).toEqual({busy:true,disabled:true});
  expect(subtitle()).toBe('512 КБ / 2 МБ');
  expect(view.root.findByType('FileFormatIcon' as any).props.name).toBe('file-excel');
  expect(view.root.findByProps({testID:'attachment-progress'}).props.accessibilityValue.now).toBe(25);
  const arc=view.root.findByProps({testID:'attachment-progress-arc'}).props;
  expect(arc.strokeDashoffset).toBeCloseTo(2*Math.PI*26*.75);
  expect(view.root.findAllByType(ActivityIndicator)).toHaveLength(0);
});

test('unknown byte length remains indeterminate and cancellation owns only the icon target',async()=>{
  const onPress=jest.fn(),onCancel=jest.fn(),stopPropagation=jest.fn();
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpFileRow,{file,state:'busy',testID:'attachment',progress:{downloaded:2048,total:null},onPress,onCancel}));});
  expect(subtitle()).toBe('2 КБ загружено');
  expect(view.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  expect(view.root.findAllByProps({testID:'attachment-progress-arc'})).toHaveLength(0);
  const cancel=view.root.findAll(n=>n.props.testID==='attachment-cancel'&&typeof n.props.onPress==='function')[0];
  await act(async()=>cancel.props.onPress({stopPropagation}));
  expect(stopPropagation).toHaveBeenCalledTimes(1);expect(onCancel).toHaveBeenCalledTimes(1);expect(onPress).not.toHaveBeenCalled();
  expect(cancel.props.accessibilityLabel).toBe('Отменить загрузку файла Склад.XLSX');
});

test('dark assistant presentation uses a compact shared surface and failures offer retry without extra controls',async()=>{
  mockDark=true;
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpFileRow,{file,state:'failed',variant:'assistant',testID:'attachment',onPress:jest.fn()}));});
  expect(StyleSheet.flatten(row().props.style)).toMatchObject({backgroundColor:'#eef',borderRadius:16,paddingHorizontal:12});
  expect(row().props.accessibilityLabel).toBe('Повторить загрузку Склад.XLSX');
  expect(subtitle()).toBe('Не загружен · Повторить');
  expect(view.root.findAll(n=>typeof n.props.onPress==='function'&&n.type===row().type)).toHaveLength(1);
});
