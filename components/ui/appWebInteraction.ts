import {Platform} from 'react-native';

export const APP_WEB_FONT='system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export type AppWebControlKind='subtle'|'filled'|'row';
/** CSS owns web transitions; native Pressable feedback keeps its existing owner. */
export function appWebControlProps(kind:AppWebControlKind='subtle'){
  return Platform.OS==='web'?{dataSet:{appControl:kind}}:{};
}
export function appWebControlContentProps(){
  return Platform.OS==='web'?{dataSet:{appControlContent:'true'}}:{};
}
