import React, {useLayoutEffect, useMemo} from 'react';
import {AppState, Platform, StatusBar, View} from 'react-native';
import {DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider} from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import {useTheme} from '@/context/ThemeContext';
import {captureException} from '@/src/shared/monitoring';

/** Paint the window and native-stack gaps with the selected app theme. */
export function AppThemeSurface({children,routeKey}:{children:React.ReactNode;routeKey?:string}) {
  const {theme,themes}=useTheme();
  const colors=themes[theme]??themes.light;
  const dark=theme==='dark',background=colors.background;
  const navigationTheme=useMemo(()=>{
    const base=dark?DarkTheme:DefaultTheme;
    return {...base,colors:{...base.colors,background,card:colors.cardBackground,text:colors.text,primary:colors.tint}};
  },[dark,background,colors.cardBackground,colors.text,colors.tint]);
  useLayoutEffect(()=>{
    if(Platform.OS==='web')return;
    const paint=()=>{void SystemUI.setBackgroundColorAsync(background).catch(error=>captureException(error,{where:'AppThemeSurface:windowBackground'}));};
    paint();
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')paint();});
    return()=>subscription.remove();
  },[background,routeKey]);
  return <NavigationThemeProvider value={navigationTheme}><View testID="app-theme-surface" style={{flex:1,backgroundColor:background}}>
    <StatusBar translucent backgroundColor="transparent" barStyle={dark?'light-content':'dark-content'}/>
    {children}
  </View></NavigationThemeProvider>;
}
