import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';

jest.mock('../components/AppHeader',()=>({AppHeader:({contentSlot}:any)=>require('react').createElement(require('react-native').View,null,contentSlot)}));
jest.mock('../hooks/useThemeColor',()=>({useThemeColor:(colors:any)=>colors.light??'#FFFFFF'}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));

import {ServicesHomeHeader} from '../src/features/services/ui/ServicesHomeHeader';

test('a failed OTA wordmark asset leaves a visible company name and working profile action',async()=>{
  const openProfile=jest.fn();let screen!:TestRenderer.ReactTestRenderer;
  await act(async()=>{screen=TestRenderer.create(React.createElement(ServicesHomeHeader,{onProfile:openProfile}));});
  try{
    expect(screen.root.findAllByProps({testID:'services-company-name-fallback'})).toHaveLength(0);
    await act(async()=>screen.root.findByProps({testID:'services-company-wordmark'}).props.onError({nativeEvent:{error:'Failed to decode local OTA asset'}}));
    expect(screen.root.findByProps({testID:'services-company-name-fallback'}).props.children).toBe('ЛИДЕР ПРОДУКТ');
    expect(screen.root.findAllByProps({testID:'services-company-wordmark'})).toHaveLength(0);
    await act(async()=>screen.root.findByProps({accessibilityLabel:'Профиль'}).props.onPress());
    expect(openProfile).toHaveBeenCalledTimes(1);
  }finally{await act(async()=>screen.unmount());}
});
