import React, {useEffect} from 'react';
import {Platform, StatusBar} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {MD3DarkTheme, MD3LightTheme, PaperProvider} from 'react-native-paper';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ThemeProvider, useTheme} from '../../context/ThemeContext';
import {NotificationHost} from '../../components/NotificationHost';
import AdminDirectory from './AdminDirectory';
import {ScreenBlurProvider} from '../../components/ui/AppScreenBlur';

function Surface() {
  const {theme,setTheme}=useTheme(), dark=theme==='dark';
  useEffect(()=>{if(Platform.OS==='web'){const selected=new URLSearchParams(location.search).get('theme');if(selected==='dark'||selected==='light')void setTheme(selected);}},[]);
  return <PaperProvider theme={dark?MD3DarkTheme:MD3LightTheme}><NotificationHost><ScreenBlurProvider>
    <StatusBar barStyle={dark?'light-content':'dark-content'}/>
    <AdminDirectory/>
  </ScreenBlurProvider></NotificationHost></PaperProvider>;
}
export default function AdminPreview() {
  return <GestureHandlerRootView style={{flex:1}}><SafeAreaProvider><ThemeProvider><Surface/></ThemeProvider></SafeAreaProvider></GestureHandlerRootView>;
}
