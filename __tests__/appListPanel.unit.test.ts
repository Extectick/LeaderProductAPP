import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {StyleSheet,TextInput} from 'react-native';
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:'light'})}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('expo-blur',()=>({BlurTargetView:'BlurTargetView'}));
jest.mock('../components/ui/AppScreenBlur',()=>({AppBlurActivityContext:require('react').createContext(true),AppEdgeBlur:'EdgeBlur'}));
jest.mock('../components/ui/AppWebScrollbar',()=>({AppWebScrollbar:'Scrollbar'}));
import {AppListPanel,AppListPanelHeader,AppListPanelMenuButton,AppListPanelActionButton} from '../components/ui/AppListPanel';

let tree:Renderer.ReactTestRenderer|undefined;
afterEach(async()=>{if(tree)await act(async()=>tree!.unmount());tree=undefined;});
const layout=(height:number)=>({nativeEvent:{layout:{height}}});

test('measured floating panels pad the existing list and bound its scrollbar without remounting it',async()=>{
  const onHeaderHeight=jest.fn(),onFooterHeight=jest.fn(),ref={current:null};let mounts=0;
  function List(props:any){React.useEffect(()=>{mounts++;},[]);return React.createElement('ExistingList',props);}
  await act(async()=>{tree=Renderer.create(React.createElement(AppListPanel,{header:'Header',footer:'Action',scrollId:'customers',scrollRef:ref,active:true,onHeaderHeight,onFooterHeight,
    renderList:padding=>React.createElement(List,padding)}));});
  const list=()=>tree!.root.findByType('ExistingList' as any),bar=()=>tree!.root.findByType('Scrollbar' as any);
  expect(list().props).toMatchObject({paddingTop:120,paddingBottom:72});
  expect(bar().props).toMatchObject({scrollRef:ref,scrollId:'customers',top:120,bottom:64,active:true});
  await act(async()=>{
    tree!.root.findByProps({testID:'app-list-panel-header'}).props.onLayout(layout(142));
    tree!.root.findByProps({testID:'app-list-panel-footer'}).props.onLayout(layout(80));
  });
  expect(list().props).toMatchObject({paddingTop:142,paddingBottom:88});
  expect(bar().props).toMatchObject({top:142,bottom:80});
  expect(onHeaderHeight).toHaveBeenLastCalledWith(142);expect(onFooterHeight).toHaveBeenLastCalledWith(80);
  expect(mounts).toBe(1);
  expect(StyleSheet.flatten(tree!.root.findByProps({testID:'app-list-panel-header-backdrop'}).props.style).bottom).toBe(-36);
  expect(tree!.root.findAllByType('EdgeBlur' as any).map(node=>node.props.edge)).toEqual(['bottom','top']);
});

test('optional footer leaves a passive bottom fade; inactive retained panels disable blur and scrollbar',async()=>{
  const render=(active:boolean,footer?:React.ReactNode)=>React.createElement(AppListPanel,{header:'Header',footer,scrollId:'clients',scrollRef:{current:null},active,
    renderList:padding=>React.createElement('List',padding)});
  await act(async()=>{tree=Renderer.create(render(true));});
  expect(tree!.root.findByType('List' as any).props.paddingBottom).toBe(16);
  const fade=tree!.root.findByProps({testID:'app-list-panel-bottom-fade'});
  expect(fade.props.pointerEvents).toBe('none');expect(StyleSheet.flatten(fade.props.style).height).toBe(32);
  expect(tree!.root.findByType('Scrollbar' as any).props.bottom).toBe(0);
  await act(async()=>tree!.update(render(false,'Action')));
  expect(tree!.root.findAllByType('EdgeBlur' as any)).toHaveLength(0);
  expect(tree!.root.findByType('Scrollbar' as any).props.active).toBe(false);
  expect(tree!.root.findByType('List' as any).props.paddingBottom).toBe(72);
  await act(async()=>tree!.update(render(true)));
  expect(tree!.root.findByType('List' as any).props.paddingBottom).toBe(16);
  expect(tree!.root.findAllByType('EdgeBlur' as any)).toHaveLength(2);
});

test('shared header exposes controlled search and real context action; optional footer respects locks',async()=>{
  const query=jest.fn(),menu=jest.fn(),create=jest.fn();
  await act(async()=>{tree=Renderer.create(React.createElement(React.Fragment,null,
    React.createElement(AppListPanelHeader,{title:'Клиенты',value:'Тест',onChangeText:query,searchLabel:'Найти клиента',trailing:React.createElement(AppListPanelMenuButton,{label:'Меню клиентов',onPress:menu,expanded:true})}),
    React.createElement(AppListPanelActionButton,{text:'Новый заказ',onPress:create,disabled:true})));
  });
  await act(async()=>tree!.root.findByType(TextInput).props.onChangeText('123'));
  expect(query).toHaveBeenLastCalledWith('123');
  await act(async()=>tree!.root.findByProps({accessibilityLabel:'Очистить поиск'}).props.onPress());
  expect(query).toHaveBeenLastCalledWith('');
  const button=tree!.root.findByProps({accessibilityLabel:'Меню клиентов'});
  expect(button.props.accessibilityState.expanded).toBe(true);await act(async()=>button.props.onPress());expect(menu).toHaveBeenCalledTimes(1);
  const footer=tree!.root.findByType(AppListPanelActionButton);
  expect(footer.findAll(node=>node.props.accessibilityRole==='button').some(node=>node.props.disabled&&node.props.accessibilityState.disabled)).toBe(true);
  expect(create).not.toHaveBeenCalled();
});
