import React from 'react';
import type {Profile} from '../../src/entities/user/types';

export function fixtureProfile(id=902):Profile{
 return {id,firstName:'Тестовый',lastName:id===901?'Пользователь':'Сотрудник',middleName:null,email:null,phone:null,
  avatarUrl:null,profileStatus:'ACTIVE',currentProfileType:'EMPLOYEE',role:{id:2,name:'employee',displayName:'Сотрудник'},departmentRoles:[],
  employeeProfile:{id,status:'ACTIVE',department:{id:81,name:'Тестовый отдел'},activeDepartment:{id:81,name:'Тестовый отдел'},departmentRoles:[],
   createdAt:new Date('2026-11-05T08:00:00Z'),updatedAt:new Date('2026-11-05T08:00:00Z')}};
}
export const AuthContext=React.createContext({isAuthenticated:true,profile:fixtureProfile(901),setProfile:async(_profile:Profile|null)=>{},setAuthenticated:(_value:boolean)=>{}});
export function FixtureAuthProvider({children}:{children:React.ReactNode}){
 return <AuthContext.Provider value={{isAuthenticated:true,profile:fixtureProfile(901),setProfile:async()=>{},setAuthenticated:()=>{}}}>{children}</AuthContext.Provider>;
}
