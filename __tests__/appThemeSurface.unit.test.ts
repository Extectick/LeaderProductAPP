import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {AppState,Platform,StatusBar,StyleSheet} from 'react-native';
import * as SystemUI from 'expo-system-ui';
import {Colors} from '../constants/Colors';
let mockTheme='light';
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:mockTheme,themes:require('../constants/Colors').Colors})}));
jest.mock('expo-system-ui',()=>({setBackgroundColorAsync:jest.fn().mockResolvedValue(undefined)}));
jest.mock('../src/shared/monitoring',()=>({captureException:jest.fn()}));
jest.mock('expo-router',()=>({ThemeProvider:'NavigationThemeProvider',DefaultTheme:{dark:false,colors:{}},DarkTheme:{dark:true,colors:{}}}));
import {AppThemeSurface} from '../components/Navigation/AppThemeSurface';

let screen:TestRenderer.ReactTestRenderer;
beforeEach(()=>{mockTheme='light';jest.replaceProperty(Platform,'OS','android');jest.mocked(SystemUI.setBackgroundColorAsync).mockClear();});
afterEach(async()=>{if(screen)await act(async()=>screen.unmount());jest.restoreAllMocks();});

test('home -> Help -> home keeps the native window, navigation scenes and root on the light app background',async()=>{
  jest.spyOn(AppState,'addEventListener').mockReturnValue({remove:jest.fn()});
  await act(async()=>{screen=TestRenderer.create(React.createElement(AppThemeSurface,{routeKey:'/services',children:null}));});
  for(const routeKey of ['/services/help','/services'])await act(async()=>screen.update(React.createElement(AppThemeSurface,{routeKey,children:null})));
  expect(SystemUI.setBackgroundColorAsync).toHaveBeenCalledTimes(3);
  expect(jest.mocked(SystemUI.setBackgroundColorAsync).mock.calls.every(([color])=>color===Colors.light.background)).toBe(true);
  expect(StyleSheet.flatten(screen.root.findByProps({testID:'app-theme-surface'}).props.style).backgroundColor).toBe(Colors.light.background);
  expect(screen.root.findByType('NavigationThemeProvider' as any).props.value.colors.background).toBe(Colors.light.background);
  expect(screen.root.findByType(StatusBar).props.barStyle).toBe('dark-content');
});

test('theme changes and returning from the background restore the current window color and remove stale listeners',async()=>{
  const listeners:Array<(state:any)=>void>=[],removes:jest.Mock[]=[];
  jest.spyOn(AppState,'addEventListener').mockImplementation((_event,listener)=>{listeners.push(listener);const remove=jest.fn();removes.push(remove);return {remove};});
  await act(async()=>{screen=TestRenderer.create(React.createElement(AppThemeSurface,{routeKey:'/services',children:null}));});
  mockTheme='dark';await act(async()=>screen.update(React.createElement(AppThemeSurface,{routeKey:'/services',children:null})));
  expect(removes[0]).toHaveBeenCalledTimes(1);
  await act(async()=>listeners.at(-1)!('active'));
  expect(SystemUI.setBackgroundColorAsync).toHaveBeenLastCalledWith(Colors.dark.background);
  expect(screen.root.findByType(StatusBar).props.barStyle).toBe('light-content');
});
