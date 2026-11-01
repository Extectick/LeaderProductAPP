import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';

jest.mock('../components/AppHeader',()=>({AppHeader:({contentSlot}:any)=>require('react').createElement(require('react-native').View,null,contentSlot)}));
jest.mock('../hooks/useThemeColor',()=>({useThemeColor:(colors:any)=>colors.light??'#FFFFFF'}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('react-native-svg',()=>({__esModule:true,default:'Svg',Path:'Path'}));

import {ServicesHomeHeader} from '../src/features/services/ui/ServicesHomeHeader';

test('company name is present on first paint as local vector paths without an OTA bitmap request',async()=>{
  const openProfile=jest.fn();let screen!:TestRenderer.ReactTestRenderer;
  await act(async()=>{screen=TestRenderer.create(React.createElement(ServicesHomeHeader,{onProfile:openProfile}));});
  try{
    expect(screen.root.findByProps({testID:'services-company-name'})).toBeDefined();
    expect(screen.root.findByType('Svg' as any).props.viewBox).toBe('0 0 2097 228');
    expect(screen.root.findByType('Path' as any).props.d.length).toBeGreaterThan(1000);
    expect(screen.root.findAllByProps({testID:'services-company-wordmark'})).toHaveLength(0);
    await act(async()=>screen.root.findByProps({accessibilityLabel:'Профиль'}).props.onPress());
    expect(openProfile).toHaveBeenCalledTimes(1);
  }finally{await act(async()=>screen.unmount());}
});
