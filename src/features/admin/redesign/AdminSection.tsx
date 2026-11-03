/** Section views shared by the application and the isolated design preview. */
import React,{useEffect} from 'react';
import {ActivityIndicator,Text,View} from 'react-native';
import {useAdminData,type AdminResource} from './AdminDataContext';
import {DesignButton,DesignList} from './AdminDesignPrimitives';
import {useHelpTheme} from '../../help/helpTheme';
import type {AdminTabKey} from '../types';
import {AdminDepartments,AdminRoles} from './AdminOrganization';
import AdminServices from './AdminServices';
import {AdminKnowledge,AdminReleaseHistory} from './AdminContent';

export default function AdminSection({section,contentTop,query,createRequest,filter,onOpenUser}: {
  section:Exclude<AdminTabKey,'users'>;contentTop:number;query:string;createRequest:number;filter:string;onOpenUser:(id:number)=>void;
}) {
  const t=useHelpTheme(),model=useAdminData();
  const resource:AdminResource|null=section==='services'||section==='knowledge'||section==='updates'?section:null;
  useEffect(()=>{if(resource)void model.loadResource(resource);},[resource,model.loadResource]);
  if(resource&&!model.resources[resource])return <DesignList top={contentTop}><View style={{padding:24,gap:16}}>{model.resourceErrors[resource]?<><Text style={{color:t.danger}}>{model.resourceErrors[resource]}</Text><DesignButton label="Повторить загрузку" onPress={()=>void model.loadResource(resource,true)}/></>:<ActivityIndicator color={t.accent}/>}</View></DesignList>;
  const shared={top:contentTop,query,createRequest,filter};
  if(section==='departments')return <AdminDepartments {...shared} onOpenUser={onOpenUser}/>;
  if(section==='roles')return <AdminRoles {...shared}/>;
  if(section==='services')return <AdminServices {...shared}/>;
  if(section==='knowledge')return <AdminKnowledge {...shared}/>;
  return <AdminReleaseHistory top={contentTop} query={query} filter={filter}/>;
}
