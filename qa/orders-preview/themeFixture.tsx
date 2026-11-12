import React from 'react';
import {Colors} from '../../constants/Colors';
export const ThemeContext = React.createContext({theme:'light', themes:Colors, setTheme:async (_theme:string)=>{}, addTheme:(_name:string,_colors:unknown)=>{}});
export const useTheme = () => React.useContext(ThemeContext);
export function ThemeProvider({children}:{children:React.ReactNode}) {
  const [theme, set] = React.useState(() => new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light');
  const setTheme = React.useCallback(async (value:string) => set(value), []);
  const value = React.useMemo(() => ({theme, themes:Colors, setTheme, addTheme:()=>{}}), [theme,setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
