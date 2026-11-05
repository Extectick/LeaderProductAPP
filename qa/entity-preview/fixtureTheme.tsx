import React from 'react';
import {Colors} from '../../constants/Colors';
const context=React.createContext({theme:'light',themes:Colors,setTheme:async(_theme:string)=>{},addTheme:(_name:string,_colors:unknown)=>{}});
export const useTheme=()=>React.useContext(context);
export function ThemeProvider({children}:{children:React.ReactNode}){
 const [theme,setTheme]=React.useState('light');
 return <context.Provider value={{theme,themes:Colors,setTheme:async value=>setTheme(value),addTheme:()=>{}}}>{children}</context.Provider>;
}
