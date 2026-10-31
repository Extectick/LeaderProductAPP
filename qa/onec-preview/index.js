import React,{useState} from 'react';
import {registerRootComponent} from 'expo';
import {ScrollView,View} from 'react-native';
import {PaperProvider,MD3LightTheme,Text,Button} from 'react-native-paper';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import {useFonts} from 'expo-font';
import {OnecConnectionForm} from '../../src/features/profile/ui/OnecConnectionForm';
function Preview(){
 const [fonts]=useFonts(MaterialCommunityIcons.font),[connected,setConnected]=useState(false),[manual,setManual]=useState(false),[busy,setBusy]=useState(false),[resetKey,reset]=useState(0),[notice,setNotice]=useState('');
 if(!fonts)return null;
 return <PaperProvider theme={MD3LightTheme}><ScrollView style={{backgroundColor:'#F8FAFC'}} contentContainerStyle={{padding:18,maxWidth:500,width:'100%',alignSelf:'center'}}>
 <Text variant="titleLarge" style={{marginVertical:16}}>Подключение 1С</Text>
 <Button onPress={()=>{setManual(x=>!x);reset(x=>x+1);}}>Сменить пример</Button>
 {notice?<Text accessibilityRole="alert" style={{color:'#047857'}}>{notice}</Text>:null}
 <OnecConnectionForm key={String(manual)} connection={{baseKey:'torg2026',label:'Торговля · рабочая база',login:manual?'':'aleksey.test',displayName:manual?null:'Алексей Тестовый',loginLocked:!manual,mapped:!manual,connected,verifiedAt:null}} resetKey={resetKey} busy={busy}
 onSave={async()=>{setBusy(true);await new Promise(r=>setTimeout(r,200));setConnected(true);setBusy(false);reset(x=>x+1);setNotice('Подключение проверено');}} onDisconnect={()=>{setConnected(false);reset(x=>x+1);setNotice('Доступ отозван');}}/>
 </ScrollView></PaperProvider>;
}
registerRootComponent(Preview);
