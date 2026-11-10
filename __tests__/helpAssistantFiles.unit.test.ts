import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
jest.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('../src/features/help/components/HelpMedia', () => ({ downloadHelpAttachment: jest.fn() }));
import { downloadHelpAttachment } from '../src/features/help/components/HelpMedia';
import { HelpAssistantFiles } from '../src/features/help/components/HelpAssistantFiles';
import type { HelpAttachment } from '../src/features/help/helpApi';

const file: HelpAttachment = { id: 'txt-32', kind: 'FILE', name: 'test.txt', size: 128, mimeType: 'text/plain', url: '/help/attachments/txt-32' };
const source = { uri: 'https://api.example.test/help/attachments/txt-32', headers: { Authorization: 'Bearer fixture-token' } };
let view: TestRenderer.ReactTestRenderer;
beforeEach(() => { jest.clearAllMocks(); });
afterEach(async () => { if (view) await act(async () => view.unmount()); });
const button = () => view.root.findAll(node => node.props.testID === 'help-assistant-file-txt-32' && typeof node.props.onPress === 'function' && node.props.style !== undefined)[0];

test('renders a real file and resolves it only after an explicit press, with duplicate presses fenced', async () => {
  let finish!: () => void;
  jest.mocked(downloadHelpAttachment).mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const resolve = jest.fn(async () => source);
  await act(async () => { view = TestRenderer.create(React.createElement(HelpAssistantFiles, { attachments: [file], resolve })); });
  expect(downloadHelpAttachment).not.toHaveBeenCalled();
  expect(resolve).not.toHaveBeenCalled();
  expect(button().props.accessibilityLabel).toContain('test.txt');
  await act(async () => { button().props.onPress(); button().props.onPress(); });
  expect(downloadHelpAttachment).toHaveBeenCalledTimes(1);
  expect(downloadHelpAttachment).toHaveBeenCalledWith(file, resolve, expect.any(AbortSignal), expect.any(Function));
  expect(button().props.accessibilityState.busy).toBe(true);
  await act(async () => finish());
  expect(button().props.accessibilityState.busy).toBe(false);
});

test.each(['resolver', 'unmount'])('late errors after %s changes are cancelled and never reported', async reason => {
  let reject!: (error: Error) => void;
  jest.mocked(downloadHelpAttachment).mockImplementation(() => new Promise<void>((_resolve, failed) => { reject = failed; }));
  const resolve = jest.fn(async () => source), onError = jest.fn();
  await act(async () => { view = TestRenderer.create(React.createElement(HelpAssistantFiles, { attachments: [file], resolve, onError })); });
  await act(async () => button().props.onPress());
  const signal = jest.mocked(downloadHelpAttachment).mock.calls[0][2]!;
  if (reason === 'resolver') await act(async () => view.update(React.createElement(HelpAssistantFiles, { attachments: [file], resolve: async () => source, onError })));
  else await act(async () => view.unmount());
  expect(signal.aborted).toBe(true);
  await act(async () => reject(new Error('private upstream URL must not appear')));
  expect(onError).not.toHaveBeenCalled();
});

test('a normal failure gives a retry and reports a generic error without the upstream details', async () => {
  jest.mocked(downloadHelpAttachment).mockRejectedValueOnce(new Error('private upstream URL'));
  const onError = jest.fn();
  await act(async () => { view = TestRenderer.create(React.createElement(HelpAssistantFiles, { attachments: [file], resolve: async () => source, onError })); });
  await act(async () => button().props.onPress());
  expect(onError).toHaveBeenCalledWith('Не удалось скачать файл. Попробуйте ещё раз.');
  expect(button().props.disabled).toBe(false);
  expect(button().props.accessibilityState.busy).toBe(false);
  jest.mocked(downloadHelpAttachment).mockResolvedValueOnce(undefined);
  await act(async () => button().props.onPress());
  expect(downloadHelpAttachment).toHaveBeenCalledTimes(2);
});

test('never falls back to an unauthenticated URL when no resolver was supplied', async () => {
  await act(async () => { view = TestRenderer.create(React.createElement(HelpAssistantFiles, { attachments: [file] })); });
  expect(button().props.disabled).toBe(true);
  await act(async () => button().props.onPress());
  expect(downloadHelpAttachment).not.toHaveBeenCalled();
});
test('cancelling a download aborts its operation, allows retry, and suppresses late failures',async()=>{
 let reject!:(error:Error)=>void;
 jest.mocked(downloadHelpAttachment).mockImplementationOnce(()=>new Promise<void>((_,fail)=>{reject=fail;}));
 const resolve=jest.fn(async()=>source),onError=jest.fn();
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantFiles,{attachments:[file],resolve,onError}));});
 await act(async()=>button().props.onPress());
 const signal=jest.mocked(downloadHelpAttachment).mock.calls[0][2]!;
 const cancel=view.root.findAll(node=>node.props.testID==='help-assistant-file-txt-32-cancel'&&typeof node.props.onPress==='function')[0];
 await act(async()=>cancel.props.onPress({stopPropagation:jest.fn()}));
 expect(signal.aborted).toBe(true);expect(button().props.disabled).toBe(false);
 expect(view.root.findAllByProps({accessibilityLiveRegion:'polite'}).length).toBeGreaterThan(0);
 await act(async()=>reject(new Error('late private upstream failure')));
 expect(onError).not.toHaveBeenCalled();expect(button().props.accessibilityState.busy).toBe(false);
 jest.mocked(downloadHelpAttachment).mockResolvedValueOnce(undefined);
 await act(async()=>button().props.onPress());expect(downloadHelpAttachment).toHaveBeenCalledTimes(2);
});
test('assistant files show received bytes from the shared authenticated transport',async()=>{
 let progress!:(value:{downloaded:number;total:number|null})=>void,finish!:()=>void;
 jest.mocked(downloadHelpAttachment).mockImplementationOnce((_file,_resolve,_signal,report)=>{progress=report!;return new Promise<void>(done=>{finish=done;});});
 const resolve=jest.fn(async()=>source);
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpAssistantFiles,{attachments:[file],resolve}));});
 await act(async()=>button().props.onPress());await act(async()=>progress({downloaded:64,total:128}));
 expect(view.root.findByProps({testID:'help-assistant-file-txt-32-progress'}).props.accessibilityValue.now).toBe(50);
 expect(view.root.findByProps({testID:'help-assistant-file-txt-32-subtitle'}).props.children).toBe('64 Б / 128 Б');
 await act(async()=>finish());expect(button().props.accessibilityState.busy).toBe(false);
});
