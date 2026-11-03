import React,{createContext,useContext,useRef,useState} from 'react';
import type {ServiceAdminItem} from '@/utils/servicesService';
import type {OnecLpAppUser,OnecLpAppPhysicalPerson} from '@/utils/onecLpAppService';
import type {ProfileStatus} from '@/types/userTypes';

export type AdminRole={id:number;name:string;displayName:string;parentRole:number|null;permissions:string[]};
export type AdminUser={
  id:number;firstName:string;lastName:string;middleName:string;email:string;phone:string;avatarUrl:string|null;
  profileStatus:ProfileStatus;employeeStatus:ProfileStatus|null;clientStatus?:ProfileStatus|null;supplierStatus?:ProfileStatus|null;
  hasEmployeeProfile:boolean;isActive:boolean;departmentId:number|null;departmentName:string;role:AdminRole;
  moderationState:string;isOnline:boolean;lastSeenAt:string|null;createdAt:string|null;
  onecUserGuid:string|null;onecPhysicalPersonGuid:string|null;onecUserName:string|null;onecPhysicalPersonName:string|null;
  channels:{push:boolean;telegram:boolean;max:boolean};channelAccounts:{telegramUserId:string|null;maxUserId:string|null};
};
export type AdminService=ServiceAdminItem&{roleIds:number[];departmentIds:number[]};
export type AdminDocument={id:string;title:string;folder:string;path:string;date:string;revision:number;content?:string};
export type ReleaseCommit={sha:string;date:string;subject:string};
export type AdminOtaRelease={id:string;version:string;publishedAt:string|null;changesAt:string;previewOnly:boolean;commits:ReleaseCommit[]};
export type AdminBinaryRelease={id:string;version:string;build:number;platform:string;channel:string;builtAt:string;publishedAt:string|null;commitSha:string;commits:ReleaseCommit[];otaUpdates:AdminOtaRelease[]};
export type AdminResource='services'|'knowledge'|'updates';
export type AdminModel={
  users:AdminUser[];departments:{id:number;name:string}[];roles:AdminRole[];permissionOptions:{key:string;label:string}[];
  services:AdminService[];documents:AdminDocument[];releases:AdminBinaryRelease[];onecUsers:OnecLpAppUser[];onecPhysicalPersons:OnecLpAppPhysicalPerson[];
  loading:boolean;error:string;resourceErrors:Partial<Record<AdminResource,string>>;resourceLoading:Partial<Record<AdminResource,boolean>>;resources:Partial<Record<AdminResource,boolean>>;
  reload:()=>Promise<void>;loadResource:(kind:AdminResource,force?:boolean)=>Promise<void>;loadOnec:()=>Promise<void>;
  loadUser:(user:AdminUser)=>Promise<AdminUser>;saveUser:(user:AdminUser,original:AdminUser)=>Promise<void>;
  moderateUser:(user:AdminUser,action:'APPROVE'|'REJECT',reason?:string)=>Promise<void>;resetPassword:(id:number,password:string)=>Promise<void>;
  saveDepartment:(draft:{id:number;name:string})=>Promise<void>;deleteDepartment:(id:number)=>Promise<void>;
  saveRole:(role:AdminRole)=>Promise<void>;saveService:(service:AdminService,restricted:boolean)=>Promise<void>;
  documentText:(document:AdminDocument)=>Promise<string>;
};
export const AdminDataContext=createContext<AdminModel|null>(null);
export function useAdminData(){const model=useContext(AdminDataContext);if(!model)throw Error('Admin data provider is missing');return model;}

/** Serialize a form mutation; keep it open with a retryable error on failure. */
export function useAdminAction(setError:(message:string)=>void){
  const lock=useRef(false),[busy,setBusy]=useState(false);
  const run=async(action:()=>Promise<void>)=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{await action();}catch(error){setError(error instanceof Error?error.message:'Не удалось сохранить изменения. Попробуйте ещё раз.');}
    finally{lock.current=false;setBusy(false);}
  };
  return {busy,run};
}
