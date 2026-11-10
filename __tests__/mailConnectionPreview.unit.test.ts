import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {ProfileConnections} from '../src/features/profile/ui/ProfileConnections';
import { MailConnectionPreview, type MailPreviewProvider } from '../src/features/profile/ui/MailConnectionPreview';

jest.mock('@/context/AuthContext',()=>({AuthContext:require('react').createContext({profile:{id:1}})}));
jest.mock('../src/features/profile/ui/ProfileMailConnections',()=>({ProfileMailConnections:()=>require('react').createElement('RealMailConnections')}));
jest.mock('react-native', () => ({ View: 'View', Pressable: 'Pressable', StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 } }));
jest.mock('react-native-paper', () => ({ Text: 'Text' }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@/components/ui/appSurfaceTokens', () => ({ useAppSurfaceTheme: () => ({ text: '#111', muted: '#666', danger: '#900' }) }));
jest.mock('../src/features/profile/ui/ConnectionPrimitives', () => ({ ConnectionAction: 'Action',ConnectionSection:({children,expanded,...props}:any)=>require('react').createElement('Section',{expanded,...props},expanded?children:null) }));
jest.mock('../src/features/profile/ui/ConnectionDialog', () => ({ ConnectionDialog: 'Dialog' }));

let screen: TestRenderer.ReactTestRenderer;
const onChange = jest.fn();
function Demo() {
  const [connected, setConnected] = React.useState<MailPreviewProvider[]>([]);
  return React.createElement(MailConnectionPreview, { connected, onChange: (next: MailPreviewProvider[]) => { onChange(next); setConnected(next); } });
}
const action = (label: string) => screen.root.findAllByType('Action' as any).find(node => node.props.children === label)!;
const radio = (label: string) => screen.root.find(node => node.type === ('Pressable' as any) && node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === label);
const texts = () => screen.root.findAllByType('Text' as any).map(node => node.props.children);
beforeEach(async () => { onChange.mockClear(); await act(async () => { screen = TestRenderer.create(React.createElement(Demo)); }); });
afterEach(async () => { await act(async () => screen.unmount()); });

test('provider selection is separate from list, adds once, and detach makes it available again', async () => {
  expect(texts()).toEqual([]);
  await act(async () => action('Подключить').props.onPress());
  expect(action('Подключить').props.disabled).toBe(true);
  await act(async () => radio('Mail.ru').props.onPress());
  expect(action('Подключить').props.disabled).toBe(false);
  await act(async () => action('Подключить').props.onPress());
  expect(onChange).toHaveBeenLastCalledWith(['mail']);
  expect(texts()).toContain('Подключено');
  expect(texts()).not.toContain('Подключено в демо');
  await act(async () => action('Добавить').props.onPress());
  expect(screen.root.findByType('Dialog' as any).props.title).toBe('Выберите провайдера');
  expect(screen.root.findByType('Dialog' as any).findAllByType('Text' as any).map(node=>node.props.children)).not.toContain('Подключено в демо');
  expect(texts()).not.toContain('Подключения');
  expect(texts()).not.toContain('Демо');
  expect(screen.root.findAllByType('Pressable' as any).filter(node => node.props.accessibilityRole === 'radio').map(node => node.props.accessibilityLabel)).toEqual(['Яндекс']);
  await act(async () => action('Отмена').props.onPress());
  await act(async () => action('Отвязать').props.onPress());
  expect(onChange).toHaveBeenLastCalledWith([]);
  await act(async () => action('Подключить').props.onPress());
  expect(radio('Mail.ru')).toBeDefined();
});

test('closing the provider dialog does not add a mailbox and clears previous selection', async () => {
  await act(async () => action('Подключить').props.onPress());
  await act(async () => radio('Яндекс').props.onPress());
  await act(async () => screen.root.findByType('Dialog' as any).props.onClose());
  expect(screen.root.findAllByType('Dialog' as any)).toHaveLength(0);
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => action('Подключить').props.onPress());
  expect(action('Подключить').props.disabled).toBe(true);
});


test('1C and Mail expand independently and collapsing 1C retains the real mail connection section',async()=>{
 await act(async()=>screen.update(React.createElement(ProfileConnections,null,React.createElement('OnecContent'))));
 const section=(title:string)=>screen.root.findAllByType('Section' as any).find(node=>node.props.title===title)!;
 await act(async()=>section('Почта').props.onPress());
 expect(section('1С').props.expanded).toBe(true);expect(section('Почта').props.expanded).toBe(true);
 expect(screen.root.findByType('RealMailConnections' as any)).toBeDefined();
 await act(async()=>section('1С').props.onPress());
 expect(section('1С').props.expanded).toBe(false);expect(section('Почта').props.expanded).toBe(true);
 expect(screen.root.findByType('RealMailConnections' as any)).toBeDefined();
 await act(async()=>section('1С').props.onPress());
 expect(section('1С').props.expanded).toBe(true);expect(section('Почта').props.expanded).toBe(true);
});
