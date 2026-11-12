/** Opt-in browser regression entry. The hook and all chat lifecycle components are real. */
import React from 'react';
import {View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ThemeProvider} from '../../context/ThemeContext';
import WebInteractionStyles from '../../components/ui/WebInteractionStyles';
import HelpScreen from '../../src/features/help/HelpScreen';
import {helpDevProbe,helpDevState} from '../../src/features/help/helpDiagnostics';
import {realServiceProbe} from './realServiceNetwork';
import {realServiceStorageSize} from './realServiceStorage';

export default function RealServicePreview(){
 React.useEffect(()=>{
  helpDevState({qaRealService:true,qaSyntheticOnly:true});
  return helpDevProbe('qa.realService',async()=>({...realServiceProbe(),storageEntries:realServiceStorageSize()}));
 },[]);
 return <SafeAreaProvider><ThemeProvider><WebInteractionStyles/>
  <View testID="help-qa-real-service" style={{flex:1}}><HelpScreen/></View>
 </ThemeProvider></SafeAreaProvider>;
}
