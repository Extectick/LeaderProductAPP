import React,{useCallback,useContext} from 'react';
import {ActivityIndicator,View,Text} from 'react-native';
import {Redirect,useRouter} from 'expo-router';
import {useIsAdmin} from '@/hooks/useIsAdmin';
import {AuthContext} from '@/context/AuthContext';
import {useHelpTheme} from '../../help/helpTheme';
import {LiveAdminProvider} from '../redesign/LiveAdminProvider';
import {useAdminData} from '../redesign/AdminDataContext';
import AdminDirectory from '../redesign/AdminDirectory';
import {DesignButton} from '../redesign/AdminDesignPrimitives';
import {useOptionalLastServiceRoute} from '@/src/features/navigation/LastServiceRouteContext';

export default function AdminScreen(){
  const {isAdmin,isCheckingAdmin}=useIsAdmin(),t=useHelpTheme(),auth=useContext(AuthContext);
  if(isCheckingAdmin)return <View style={{flex:1,justifyContent:'center',backgroundColor:t.background}}><ActivityIndicator color={t.accent}/></View>;
  if(!isAdmin)return <Redirect href={{pathname:'/access-denied',params:{reason:'no_permission'}}}/>;
  return <LiveAdminProvider key={auth?.profile?.id}><AdminContent/></LiveAdminProvider>;
}
function AdminContent(){
  const model=useAdminData(),t=useHelpTheme(),router=useRouter(),auth=useContext(AuthContext);
  const lastService=useOptionalLastServiceRoute();
  const exit=useCallback(()=>{lastService?.clearLastServiceRoute();router.replace('/services');},[lastService,router]);
  if(model.loading||model.error)return <View style={{flex:1,justifyContent:'center',padding:24,gap:16,backgroundColor:t.background}}>{model.error?<><Text style={{color:t.danger}}>{model.error}</Text><DesignButton label="Повторить загрузку" onPress={()=>void model.reload()}/><DesignButton label="Вернуться к сервисам" secondary onPress={exit}/></>:<ActivityIndicator color={t.accent}/>}</View>;
  return <AdminDirectory onExit={exit} onProfile={()=>router.push('/profile')} administratorName={[auth?.profile?.firstName,auth?.profile?.lastName].filter(Boolean).join(' ')||'Администратор'}/>;
}
