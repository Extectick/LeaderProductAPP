import React from 'react';
import {Platform,View} from 'react-native';
import {Colors} from '../../constants/Colors';
export const AuthContext=React.createContext<any>(null);
export const useTheme=()=>({theme:'light',themes:Colors});
export const AppHeader=({contentSlot}:{contentSlot:React.ReactNode})=><View>{contentSlot}</View>;
export const API_BASE_URL=Platform.OS==='web'?window.location.origin+'/avatar-fixture':'http://10.0.2.2:8124/avatar-fixture';
let viewer=1;
// Synthetic unsigned fixture tokens, accepted only by this isolated middleware.
const tokens:Record<number,string>={1:'eyJhbGciOiJub25lIn0.eyJ1c2VySWQiOjF9.fixture',2:'eyJhbGciOiJub25lIn0.eyJ1c2VySWQiOjJ9.fixture'};
export const setViewer=(id:number)=>{viewer=id;};
export const getAccessToken=async()=>tokens[viewer];
export const getAccessTokenForRequest=getAccessToken;
export const refreshToken=getAccessToken;
export const onAuthSessionExpired=(_callback:()=>void)=>()=>{};
