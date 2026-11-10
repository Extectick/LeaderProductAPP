import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {AppState} from 'react-native';
import {ProfileOnecConnections} from '../src/features/profile/ui/ProfileOnecConnections';
import {loadOnecConnections,saveOnecConnection,removeOnecConnection,type OnecConnection} from '../src/features/profile/api/onecConnections';

jest.mock('react-native',()=>({View:'View',Pressable:'Pressable',AppState:{addEventListener:jest.fn(()=>({remove:jest.fn()}))}}));
jest.mock('react-native-paper',()=>({Text:'Text',ActivityIndicator:'ActivityIndicator'}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Icon'}));
jest.mock('expo-router',()=>({useFocusEffect:(callback:()=>void)=>require('react').useEffect(callback,[callback])}));
jest.mock('@/components/ui/appSurfaceTokens',()=>({useAppSurfaceTheme:()=>({text:'#111',muted:'#666',green:'#080',danger:'#900'})}));
jest.mock('../src/features/profile/ui/ConnectionPrimitives',()=>({ConnectionAction:'Action',ConnectionField:'Field'}));
jest.mock('../src/features/profile/ui/ConnectionDialog',()=>({ConnectionDialog:'Dialog'}));
jest.mock('../src/features/profile/api/onecConnections',()=>({loadOnecConnections:jest.fn(),saveOnecConnection:jest.fn(),removeOnecConnection:jest.fn()}));

const base:OnecConnection={baseKey:'main',label:'Торговля',login:'employee',displayName:null,loginLocked:false,mapped:true,connected:false,verifiedAt:null};
let view:TestRenderer.ReactTestRenderer;
const fields=()=>view.root.findAllByType('Field' as any);
const action=(label:string)=>view.root.findAllByType('Action' as any).find(node=>node.props.children===label)!;
const dialog=()=>view.root.findByType('Dialog' as any);
beforeEach(()=>{jest.clearAllMocks();jest.mocked(loadOnecConnections).mockResolvedValue([base]);});
afterEach(async()=>{if(view)await act(async()=>view.unmount());});
async function render(extra:Partial<React.ComponentProps<typeof ProfileOnecConnections>>={}){
 await act(async()=>{view=TestRenderer.create(React.createElement(ProfileOnecConnections,{userId:121,...extra}));});
}

test('credentials exist only in the modal; cancel and background discard the password',async()=>{
 await render();expect(fields()).toHaveLength(0);
 await act(async()=>action('Подключить').props.onPress());
 expect(dialog().props.title).toBe('Подключение пользователя 1С');expect(fields()).toHaveLength(2);
 await act(async()=>fields()[1].props.onChangeText('test-only-secret'));
 await act(async()=>dialog().props.onClose());expect(fields()).toHaveLength(0);
 await act(async()=>action('Подключить').props.onPress());expect(fields()[1].props.value).toBe('');
 await act(async()=>fields()[1].props.onChangeText('test-only-secret'));
 const onState=jest.mocked(AppState.addEventListener).mock.calls[0][1];
 await act(async()=>onState('background'));expect(fields()).toHaveLength(0);
 expect(saveOnecConnection).not.toHaveBeenCalled();
});

test('failed authorization keeps its error in the modal; success closes and resumes with the request signal',async()=>{
 const onConnected=jest.fn().mockResolvedValue(undefined);
 await render({onConnected});expect(fields()).toHaveLength(2);
 jest.mocked(saveOnecConnection).mockRejectedValueOnce(new Error('Неверный пароль'));
 await act(async()=>fields()[1].props.onChangeText('test-only-secret'));
 const submit=()=>dialog().findAllByType('Action' as any).find(node=>node.props.children==='Подключить')!;
 await act(async()=>submit().props.onPress());
 expect(dialog().findAllByType('Text' as any).map(node=>node.props.children)).toContain('Неверный пароль');
 expect(fields()[1].props.value).toBe('');expect(onConnected).not.toHaveBeenCalled();
 jest.mocked(saveOnecConnection).mockResolvedValueOnce({...base,connected:true,displayName:'Иван Петров'});
 await act(async()=>fields()[1].props.onChangeText('test-only-retry'));
 await act(async()=>submit().props.onPress());
 expect(view.root.findAllByType('Dialog' as any)).toHaveLength(0);expect(fields()).toHaveLength(0);
 const signal=jest.mocked(saveOnecConnection).mock.calls[1][4];
 expect(signal.aborted).toBe(false);expect(onConnected).toHaveBeenCalledWith(signal);
 expect(action('Отвязать').props.mode).toBe('text');
});

test('protected base selection opens the requested account; in-flight save cannot dismiss or resume after unmount',async()=>{
 const secondary={...base,baseKey:'other',label:'Другая база'};
 jest.mocked(loadOnecConnections).mockResolvedValue([base,secondary]);
 const onConnected=jest.fn();let finish!:(row:OnecConnection)=>void;
 jest.mocked(saveOnecConnection).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 await render({initialBase:'other',onConnected});
 expect(view.root.findAllByType('Pressable' as any).find(node=>node.props.accessibilityLabel==='Другая база')?.props.accessibilityState.checked).toBe(true);
 expect(dialog().findAllByType('Text' as any).map(node=>node.props.children)).not.toContain('База');
 await act(async()=>fields()[1].props.onChangeText('test-only-secret'));
 const submit=dialog().findAllByType('Action' as any).find(node=>node.props.children==='Подключить')!;
 await act(async()=>{void submit.props.onPress();void submit.props.onPress();});
 expect(saveOnecConnection).toHaveBeenCalledTimes(1);expect(dialog().props.busy).toBe(true);
 await act(async()=>dialog().props.onClose());expect(view.root.findAllByType('Dialog' as any)).toHaveLength(1);
 const signal=jest.mocked(saveOnecConnection).mock.calls[0][4];
 await act(async()=>view.unmount());expect(signal.aborted).toBe(true);
 await act(async()=>finish({...secondary,connected:true}));expect(onConnected).not.toHaveBeenCalled();
});

test('disconnect remains inline and reveals only the connect trigger after confirmation',async()=>{
 jest.mocked(loadOnecConnections).mockResolvedValue([{...base,connected:true}]);
 jest.mocked(removeOnecConnection).mockResolvedValue(base);
 await render();expect(fields()).toHaveLength(0);
 await act(async()=>action('Отвязать').props.onPress());
 expect(removeOnecConnection).toHaveBeenCalledWith(121,'main',expect.any(AbortSignal));
 expect(view.root.findAllByType('Dialog' as any)).toHaveLength(0);expect(action('Подключить')).toBeDefined();
});
