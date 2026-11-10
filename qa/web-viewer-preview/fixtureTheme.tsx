import React from 'react';
import {Colors} from '../../constants/Colors';
export const ThemeContext=React.createContext({theme:'light',themes:Colors,setTheme:async(_theme:string)=>{},addTheme:(_name:string,_colors:unknown)=>{}});
export const useTheme=()=>React.useContext(ThemeContext);
export function ThemeProvider({children}:{children:React.ReactNode}){
 const [theme,setTheme]=React.useState('light');
 return <ThemeContext.Provider value={{theme,themes:Colors,setTheme:async value=>setTheme(value),addTheme:()=>{}}}>{children}</ThemeContext.Provider>;
}
