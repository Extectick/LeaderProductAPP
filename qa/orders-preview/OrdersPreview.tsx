import React from 'react';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {MD3DarkTheme,MD3LightTheme,PaperProvider} from 'react-native-paper';
import {ThemeProvider,useTheme} from './themeFixture';
import WebInteractionStyles from '../../components/ui/WebInteractionStyles';
import {ScreenBlurProvider} from '../../components/ui/AppScreenBlur';
import ClientOrdersWebScreen from '../../src/features/clientOrders/ClientOrdersWebScreen';
import {fixtureThumbnail} from './workspaceFixture';
function Content(){
 const {theme}=useTheme();
 const [inset,setInset]=React.useState(()=>Number(new URLSearchParams(location.search).get('inset')??72));
 (window as any).__ordersQaSetRail=setInset;
 React.useEffect(()=>{document.title='Заказы клиентов · локальный QA';document.body.style.margin='0';document.documentElement.style.height='100%';document.body.style.height='100%';},[]);
 return <PaperProvider theme={theme==='dark'?MD3DarkTheme:MD3LightTheme}><ScreenBlurProvider><WebInteractionStyles/>
  <div data-testid="orders-preview-shell" style={{height:'100dvh',display:'flex',background:theme==='dark'?'#151B22':'#F7F9FC'}}>
   {inset>0?<aside aria-label="Место боковой навигации" style={{width:inset,flexShrink:0,borderRight:`1px solid ${theme==='dark'?'#303B47':'#DCE3EC'}`,display:'flex',alignItems:'center',flexDirection:'column',paddingTop:20,boxSizing:'border-box'}}><img src={fixtureThumbnail} alt="Демо" style={{width:36,height:36,borderRadius:10}}/><button aria-label="Изменить ширину тестовой навигации" onClick={()=>setInset(value=>value===72?216:72)} style={{marginTop:20,fontSize:11,width:48,padding:4,border:'none',borderRadius:8,background:theme==='dark'?'#303B47':'#E9EEF6',color:theme==='dark'?'#F2F4F7':'#627185'}}>{inset}px</button></aside>:null}
   <main style={{position:'relative',display:'flex',flexDirection:'column',flex:1,minWidth:0,height:'100%',overflow:'hidden'}}><ClientOrdersWebScreen/></main>
  </div>
 </ScreenBlurProvider></PaperProvider>;
}
export default function OrdersPreview(){return <SafeAreaProvider><ThemeProvider><Content/></ThemeProvider></SafeAreaProvider>;}
