import React,{useContext} from 'react';
import {AuthContext} from '@/context/AuthContext';
import {ThemeContext,useTheme} from '@/context/ThemeContext';
import {EntityCardContext,useEntityCards} from './EntityCardContext';

/** Gorhom renders modal content at its root host, above the app's auth/theme
 * providers. Capture the originating contexts before moving the content. */
export function useEntityCardPortalContext(){
 return {auth:useContext(AuthContext),theme:useTheme(),navigation:useEntityCards()};
}
export function EntityCardPortalContext({value,children}:{value:ReturnType<typeof useEntityCardPortalContext>;children:React.ReactNode}){
 return <AuthContext.Provider value={value.auth}><ThemeContext.Provider value={value.theme}>
  <EntityCardContext.Provider value={value.navigation}>{children}</EntityCardContext.Provider>
 </ThemeContext.Provider></AuthContext.Provider>;
}
