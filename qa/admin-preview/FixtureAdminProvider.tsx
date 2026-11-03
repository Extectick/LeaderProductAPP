/** The preview renders production UI with this in-memory adapter; no live requests. */
import React,{useMemo,useRef,useState} from 'react';
import {AdminDataContext,type AdminModel,type AdminUser,type AdminRole,type AdminService} from '../../src/features/admin/redesign/AdminDataContext';
import * as fixture from './apiFixture';
import {knowledgeDocuments,permissionOptions} from './adminSectionData';
import history from './releaseHistory.generated.json';

export function FixtureAdminProvider({children}:{children:React.ReactNode}){
  const [state,setState]=useState(()=>({
    users:fixture.users.map(user=>({...user,middleName:user.middleName??'',phone:user.phone??'',hasEmployeeProfile:true})) as AdminUser[],
    departments:fixture.departments.map(item=>({...item})),roles:fixture.roles.map(role=>({...role,permissions:[...role.permissions]})) as AdminRole[],
    services:fixture.services.map(item=>({...item,gradientStart:null,gradientEnd:null})) as AdminService[],
  }));
  const current=useRef(state);current.current=state;
  const methods=useMemo(()=>({
    reload:async()=>{},loadResource:async()=>{},loadOnec:async()=>{},resetPassword:async()=>{},
    loadUser:async(user:AdminUser)=>current.current.users.find(item=>item.id===user.id)??user,
    saveUser:async(user:AdminUser)=>{setState(previous=>({...previous,users:previous.users.map(item=>item.id===user.id?{...user}:item)}));},
    moderateUser:async(user:AdminUser,action:'APPROVE'|'REJECT')=>{const status=action==='APPROVE'?'ACTIVE':'BLOCKED';setState(previous=>({...previous,users:previous.users.map(item=>item.id===user.id?{...item,employeeStatus:status,moderationState:action==='APPROVE'?'EMPLOYEE_ACTIVE':'EMPLOYEE_BLOCKED'}:item)}));},
    saveDepartment:async(draft:{id:number;name:string})=>{setState(previous=>({...previous,departments:draft.id?previous.departments.map(item=>item.id===draft.id?draft:item):[...previous.departments,{...draft,id:Date.now()}],users:previous.users.map(user=>user.departmentId===draft.id?{...user,departmentName:draft.name}:user)}));},
    deleteDepartment:async(id:number)=>{setState(previous=>({...previous,departments:previous.departments.filter(item=>item.id!==id)}));},
    saveRole:async(draft:AdminRole)=>{setState(previous=>({...previous,roles:draft.id?previous.roles.map(item=>item.id===draft.id?draft:item):[...previous.roles,{...draft,id:Date.now()}]}));},
    saveService:async(draft:AdminService)=>{setState(previous=>({...previous,services:draft.id?previous.services.map(item=>item.id===draft.id?draft:item):[...previous.services,{...draft,id:Date.now()}]}));},
    documentText:async(document:{content?:string})=>document.content??'',
  }),[]);
  const model:AdminModel={...state,...methods,permissionOptions,documents:knowledgeDocuments.map(item=>({...item,id:String(item.id),revision:1})),releases:history.releases,
    onecUsers:fixture.onecUsers,onecPhysicalPersons:fixture.onecPhysicalPersons,loading:false,error:'',resources:{services:true,knowledge:true,updates:true},resourceErrors:{},resourceLoading:{}};
  return <AdminDataContext.Provider value={model}>{children}</AdminDataContext.Provider>;
}
