import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import * as usersApi from '@/utils/userService';
import * as servicesApi from '@/utils/servicesService';
import {listOnecLpAppUsers,listOnecLpAppPhysicalPersons} from '@/utils/onecLpAppService';
import {apiClient} from '@/utils/apiClient';
import {getUpdatesList} from '@/utils/updateAdminService';
import {knowledgeApi} from '../../knowledge/api';
import {AdminDataContext,type AdminModel,type AdminResource,type AdminUser,type AdminRole,type AdminService} from './AdminDataContext';
import {mapRole,mapUser,mapService,mergeProfile,releaseHistory,type OtaRecord} from './adminModel';

type Data=Pick<AdminModel,'users'|'departments'|'roles'|'permissionOptions'|'services'|'documents'|'releases'|'onecUsers'|'onecPhysicalPersons'|'loading'|'error'|'resourceErrors'|'resourceLoading'|'resources'>;
const empty:Data={users:[],departments:[],roles:[],permissionOptions:[],services:[],documents:[],releases:[],onecUsers:[],onecPhysicalPersons:[],loading:true,error:'',resourceErrors:{},resourceLoading:{},resources:{}};
export function LiveAdminProvider({children}:{children:React.ReactNode}){
  const [data,setData]=useState<Data>(empty),current=useRef(data);current.current=data;
  const alive=useRef(true),generation=useRef(0),resourceJobs=useRef(new Map<AdminResource,Promise<void>>()),onecJob=useRef<Promise<void>|null>(null),onecLoaded=useRef(false);
  const createdServices=useRef(new Map<string,number>());
  const put=useCallback((patch:Partial<Data>)=>{if(alive.current)setData(previous=>({...previous,...patch}));},[]);
  const reload=useCallback(async()=>{
    const version=++generation.current;put({loading:true,error:''});
    try{
      const [rawRoles,departments,permissions]=await Promise.all([usersApi.getRoles(),usersApi.getDepartments(),usersApi.getPermissions()]);
      const roles=rawRoles.map(mapRole);let page=1,all:AdminUser[]=[];
      // Read the complete company directory in bounded server pages, once per admin visit.
      for(;;){const result=await usersApi.getAdminUsersPage({page,limit:100,sortBy:'status',sortDir:'asc'});all.push(...result.items.map(item=>mapUser(item,roles)));if(!result.meta.hasNext)break;if(!result.items.length||page++>=100)throw Error('Не удалось полностью загрузить каталог сотрудников. Повторите запрос.');}
      if(version===generation.current)put({users:all,roles,departments,permissionOptions:permissions.map(item=>({key:item.name,label:item.displayName||item.name})),loading:false});
    }catch(error){if(version===generation.current)put({loading:false,error:message(error)});}
  },[put]);
  useEffect(()=>{alive.current=true;void reload();return()=>{alive.current=false;generation.current++;};},[reload]);
  const refreshUser=useCallback(async(user:AdminUser)=>{
    const profile=await usersApi.getProfileById(user.id);if(!profile)throw Error('Профиль не найден');
    const next=mergeProfile(user,profile,current.current.roles);
    if(alive.current)setData(previous=>({...previous,users:previous.users.map(item=>item.id===user.id?next:item)}));
    return next;
  },[]);
  const saveUser=useCallback(async(draft:AdminUser,original:AdminUser)=>{
    const patch:Parameters<typeof usersApi.adminUpdateUser>[1]={};
    for(const key of ['firstName','lastName','middleName','email','phone'] as const)if(draft[key]!==original[key])patch[key]=draft[key].trim();
    if(draft.isActive!==original.isActive)patch.profileStatus=draft.isActive?'ACTIVE':'BLOCKED';
    for(const key of ['onecUserGuid','onecPhysicalPersonGuid'] as const)if(draft[key]!==original[key])patch[key]=draft[key];
    if(Object.keys(patch).length)await usersApi.adminUpdateUser(draft.id,patch);
    if(draft.role.id&&draft.role.id!==original.role.id)await usersApi.assignUserRole(draft.id,{roleId:draft.role.id});
    if(draft.hasEmployeeProfile&&(draft.departmentId!==original.departmentId||draft.employeeStatus!==original.employeeStatus))await usersApi.adminUpdateUserProfile(draft.id,'employee',{departmentId:draft.departmentId,...(draft.employeeStatus?{status:draft.employeeStatus}:{})});
    for(const kind of ['client','supplier'] as const){const key=kind==='client'?'clientStatus':'supplierStatus';if(draft[key]&&draft[key]!==original[key])await usersApi.adminUpdateUserProfile(draft.id,kind,{status:draft[key]});}
    await refreshUser(draft);
  },[refreshUser]);
  const moderateUser=useCallback(async(user:AdminUser,action:'APPROVE'|'REJECT',reason?:string)=>{await usersApi.moderateEmployeeProfile(user.id,{action,reason});await refreshUser(user);},[refreshUser]);
  const saveDepartment=useCallback(async(draft:{id:number;name:string})=>{
    const departments=draft.id?await usersApi.updateDepartment(draft.id,draft.name):await usersApi.createDepartment(draft.name);
    if(alive.current)setData(previous=>({...previous,departments,users:previous.users.map(user=>user.departmentId===draft.id?{...user,departmentName:draft.name}:user)}));
  },[]);
  const deleteDepartment=useCallback(async(id:number)=>{put({departments:await usersApi.deleteDepartment(id)});},[put]);
  const saveRole=useCallback(async(draft:AdminRole)=>{
    if(draft.id){await usersApi.updateRole(draft.id,{displayName:draft.displayName,parentRoleId:draft.parentRole});await usersApi.updateRolePermissions(draft.id,draft.permissions);}
    else await usersApi.createRole({name:`role_${Date.now()}`,displayName:draft.displayName,parentRoleId:draft.parentRole,permissions:draft.permissions});
    const roles=(await usersApi.getRoles()).map(mapRole);
    if(alive.current)setData(previous=>({...previous,roles,users:previous.users.map(user=>({...user,role:roles.find(role=>role.id===user.role.id)??user.role}))}));
  },[]);
  const saveService=useCallback(async(draft:AdminService,restricted:boolean)=>{
    const previous=current.current.services.find(item=>item.id===draft.id);
    const accessChanged=!previous||['roleIds','departmentIds'].some(key=>JSON.stringify(draft[key as 'roleIds'])!==JSON.stringify(previous[key as 'roleIds']))||restricted!==(!previous.defaultVisible&&!previous.defaultEnabled);
    const payload={name:draft.name,description:draft.description,isActive:draft.isActive,defaultVisible:accessChanged&&restricted?false:draft.defaultVisible,defaultEnabled:accessChanged&&restricted?false:draft.defaultEnabled};
    // Resume our own successful create if a subsequent rules request failed.
    let id=draft.id||createdServices.current.get(draft.key)||0;
    if(id)await servicesApi.updateService(id,payload);
    else {if(!draft.key.trim()||!draft.route?.trim())throw Error('Укажите ключ и маршрут сервиса');id=(await servicesApi.createAdminService({...payload,key:draft.key,route:draft.route,kind:draft.kind,icon:draft.icon})).service.id;createdServices.current.set(draft.key,id);}
    if(accessChanged){
      const selected=(ids:number[],rules:{visible:boolean|null;enabled:boolean|null;roleId?:number;departmentId?:number}[],key:'roleId'|'departmentId')=>{
        // Retain explicit deny/inherit rules that are not represented by the allow toggles.
        const preserved=rules.filter(rule=>!(rule.visible===true&&rule.enabled===true)&&!ids.includes(rule[key]!));
        return [...preserved,...ids.map(id=>({[key]:id,visible:true,enabled:true}))];
      };
      await servicesApi.replaceServiceAccessRules(id,{roleAccess:selected(draft.roleIds,previous?.roleAccess??[],'roleId') as servicesApi.ServiceRoleRule[],departmentAccess:selected(draft.departmentIds,previous?.departmentAccess??[],'departmentId') as servicesApi.ServiceDepartmentRule[],departmentRoleAccess:previous?.departmentRoleAccess??[],userAccess:previous?.userAccess??[]});
    }
    put({services:(await servicesApi.getAdminServices()).map(mapService)});
    createdServices.current.delete(draft.key);
  },[put]);
  const loadOnec=useCallback(async()=>{
    if(onecLoaded.current)return;if(onecJob.current)return onecJob.current;
    const job=Promise.all([listOnecLpAppUsers(),listOnecLpAppPhysicalPersons()]).then(([onecUsers,onecPhysicalPersons])=>{put({onecUsers,onecPhysicalPersons});onecLoaded.current=true;}).finally(()=>{onecJob.current=null;});onecJob.current=job;return job;
  },[put]);
  const loadResource=useCallback(async(kind:AdminResource,force=false)=>{
    if(!force&&current.current.resources[kind])return;if(resourceJobs.current.has(kind))return resourceJobs.current.get(kind)!;
    setData(previous=>({...previous,resourceLoading:{...previous.resourceLoading,[kind]:true},resourceErrors:{...previous.resourceErrors,[kind]:''}}));
    const job=(async()=>{
      try{
        if(kind==='services')put({services:(await servicesApi.getAdminServices()).map(mapService)});
        if(kind==='knowledge'){
          let cursor:string|undefined;const documents:Data['documents']=[];const seen=new Set<string>();
          do{const result=await knowledgeApi.documents({view:'all',cursor});for(const item of result.documents)documents.push({id:item.id,title:item.title,folder:item.section==='COMPANY'?'company':item.section==='AI_WORKSPACE'?'draft':'archive',path:item.path,date:new Date(item.updatedAt).toLocaleString('ru-RU'),revision:item.currentRevision});cursor=result.nextCursor??undefined;if(cursor&&seen.has(cursor))throw Error('Повтор страницы документов');if(cursor)seen.add(cursor);}while(cursor);put({documents});
        }
        if(kind==='updates'){
          let offset=0;const apks:Awaited<ReturnType<typeof getUpdatesList>>['data']=[];
          for(;;){const result=await getUpdatesList({limit:100,offset});apks.push(...result.data);offset+=result.data.length;if(offset>=result.meta.total)break;if(!result.data.length)throw Error('Не удалось загрузить историю версий');}
          const result=await apiClient<void,OtaRecord[]>('/ota');if(!result.ok)throw Error(result.message||'Не удалось загрузить OTA-обновления');put({releases:releaseHistory(apks,result.data??[])});
        }
        if(alive.current)setData(previous=>({...previous,resources:{...previous.resources,[kind]:true}}));
      }catch(error){if(alive.current)setData(previous=>({...previous,resourceErrors:{...previous.resourceErrors,[kind]:kind==='knowledge'&&(error as {status?:number}).status===404?'База знаний пока не подключена на этом сервере. Документы в облачной папке не изменены.':message(error)}}));}
      finally{resourceJobs.current.delete(kind);if(alive.current)setData(previous=>({...previous,resourceLoading:{...previous.resourceLoading,[kind]:false}}));}
    })();resourceJobs.current.set(kind,job);return job;
  },[put]);
  const actions=useMemo(()=>({reload,loadUser:refreshUser,saveUser,moderateUser,saveDepartment,deleteDepartment,saveRole,saveService,loadOnec,loadResource,
    resetPassword:async(id:number,password:string)=>{await usersApi.adminUpdatePassword(id,password);},
    documentText:async(document:Data['documents'][number])=>(await knowledgeApi.preview(document.id,document.revision)).version.text??'Текст документа пока не извлечён.',
  }),[reload,refreshUser,saveUser,moderateUser,saveDepartment,deleteDepartment,saveRole,saveService,loadOnec,loadResource]);
  return <AdminDataContext.Provider value={{...data,...actions}}>{children}</AdminDataContext.Provider>;
}
function message(error:unknown){return error instanceof Error?error.message:'Не удалось загрузить данные. Попробуйте ещё раз.';}
