import type {AdminUsersListItem,RoleItem} from '@/utils/userService';
import type {Profile} from '@/types/userTypes';
import type {ServiceAdminItem} from '@/utils/servicesService';
import type {AdminUser,AdminRole,AdminService,AdminBinaryRelease,ReleaseCommit} from './AdminDataContext';
import type {UpdateItem} from '@/utils/updateAdminService';
import gitCatalog from './releaseGit.generated.json';

export const mapRole=(role:RoleItem):AdminRole=>({...role,displayName:role.displayName||role.name,parentRole:role.parentRole?.id??null,permissions:role.permissions??[]});
export const mapService=(service:ServiceAdminItem):AdminService=>({...service,roleIds:service.roleAccess.filter(rule=>rule.visible===true&&rule.enabled===true).map(rule=>rule.roleId),departmentIds:service.departmentAccess.filter(rule=>rule.visible===true&&rule.enabled===true).map(rule=>rule.departmentId)});
const noRole:AdminRole={id:0,name:'',displayName:'Без роли',parentRole:null,permissions:[]};
export function mapUser(user:AdminUsersListItem,roles:AdminRole[]):AdminUser{
  return {...user,firstName:user.firstName??'',lastName:user.lastName??'',middleName:user.middleName??'',email:user.email??'',phone:user.phone??'',avatarUrl:user.avatarUrl??null,
    role:roles.find(role=>role.id===user.role?.id)??(user.role?{...noRole,...user.role,displayName:user.role.displayName||user.role.name}:noRole),
    profileStatus:user.profileStatus??'PENDING',employeeStatus:user.employeeStatus??null,hasEmployeeProfile:user.moderationState!=='NO_EMPLOYEE_PROFILE',isActive:user.profileStatus==='ACTIVE',
    departmentId:user.departmentId??null,departmentName:user.departmentName??'Без отдела',onecUserGuid:user.onecUserGuid??null,onecPhysicalPersonGuid:user.onecPhysicalPersonGuid??null,
    onecUserName:null,onecPhysicalPersonName:null,isOnline:Boolean(user.isOnline),lastSeenAt:user.lastSeenAt??null,createdAt:user.createdAt?String(user.createdAt):null,
    channels:user.channels??{push:false,telegram:false,max:false},channelAccounts:{telegramUserId:null,maxUserId:null}};
}
export function mergeProfile(user:AdminUser,profile:Profile,roles:AdminRole[]):AdminUser{
  return {...user,firstName:profile.firstName??'',lastName:profile.lastName??'',middleName:profile.middleName??'',email:profile.email??'',phone:profile.phone??'',avatarUrl:profile.employeeProfile?.avatarUrl??profile.avatarUrl??user.avatarUrl,
    profileStatus:profile.profileStatus,isActive:profile.profileStatus==='ACTIVE',hasEmployeeProfile:Boolean(profile.employeeProfile),employeeStatus:profile.employeeProfile?.status??null,
    clientStatus:profile.clientProfile?.status??null,supplierStatus:profile.supplierProfile?.status??null,
    role:roles.find(role=>role.id===profile.role?.id)??user.role,departmentId:profile.employeeProfile?.department?.id??null,departmentName:profile.employeeProfile?.department?.name??'Без отдела',
    onecUserGuid:profile.employeeProfile?.onecUserGuid??null,onecPhysicalPersonGuid:profile.employeeProfile?.onecPhysicalPersonGuid??null,
    channelAccounts:{telegramUserId:profile.telegramId??null,maxUserId:profile.maxId??null}};
}
export function inheritedPermissions(role:AdminRole,roles:AdminRole[],all:string[],visited=new Set<number>()):Set<string>{
  if(visited.has(role.id))return new Set();visited.add(role.id);
  if(role.permissions.includes('admin')||role.name==='admin')return new Set(all);
  const parent=roles.find(candidate=>candidate.id===role.parentRole);
  return new Set([...role.permissions,...(parent?inheritedPermissions(parent,roles,all,visited):[])]);
}
export function canInheritRole(roleId:number,candidate:AdminRole,roles:AdminRole[]){
  const visited=new Set<number>();let current:AdminRole|undefined=candidate;
  while(current){if(current.id===roleId||visited.has(current.id))return false;visited.add(current.id);current=roles.find(role=>role.id===current?.parentRole);}return true;
}
export function releaseComments(notes?:string|null,sha?:string|null):ReleaseCommit[]{
  return (notes??'').split(/\r?\n/).map(line=>line.trim().replace(/^[-*]\s*/,'' )).filter(Boolean).map((subject,index)=>({sha:sha?`${sha}${index?':'+index:''}`:'',date:'',subject}));
}
export type OtaRecord={id:string|number;platform:string;channel:string;runtimeVersion:string;displayVersion?:string|null;otaSequence?:number|null;createdAt:string;commitSha?:string|null;releaseNotes?:string|null};
type Catalog=Record<string,{parents:string[];date:string;subject:string}>;
export function gitChanges(to:string,from?:string,catalog:Catalog=gitCatalog.commits):ReleaseCommit[]{
  if(!catalog[to])return [];
  if(!from||!catalog[from])return [{sha:to,date:catalog[to].date,subject:catalog[to].subject}];
  const excluded=new Set<string>(),stack=[from];
  while(stack.length){const sha=stack.pop()!;if(excluded.has(sha))continue;excluded.add(sha);stack.push(...(catalog[sha]?.parents??[]));}
  const included=new Set<string>(),pending=[to];let related=false;
  while(pending.length){const sha=pending.pop()!;if(excluded.has(sha)){related=true;continue;}if(included.has(sha))continue;if(!catalog[sha])return [{sha:to,date:catalog[to].date,subject:catalog[to].subject}];included.add(sha);pending.push(...catalog[sha].parents);}
  if(!related)return [{sha:to,date:catalog[to].date,subject:catalog[to].subject}];
  return [...included].filter(sha=>catalog[sha].parents.length<2).map(sha=>({sha,date:catalog[sha].date,subject:catalog[sha].subject})).sort((a,b)=>b.date.localeCompare(a.date));
}
export function releaseHistory(apks:UpdateItem[],otas:OtaRecord[]):AdminBinaryRelease[]{
  const releases:AdminBinaryRelease[]=apks.map(item=>({id:String(item.id),version:item.versionName,build:item.versionCode,platform:item.platform.toLowerCase(),channel:item.channel,builtAt:item.createdAt,publishedAt:item.createdAt,commitSha:'',commits:releaseComments(item.releaseNotes),otaUpdates:[]}));
  const previousCommit=new Map<string,string>();
  for(const ota of [...otas].sort((a,b)=>a.createdAt.localeCompare(b.createdAt))){
    let parent=releases.find(item=>item.version===ota.runtimeVersion&&item.channel===ota.channel&&item.platform===ota.platform.toLowerCase());
    if(!parent){parent={id:`runtime:${ota.platform}:${ota.channel}:${ota.runtimeVersion}`,version:ota.runtimeVersion,build:0,platform:ota.platform.toLowerCase(),channel:ota.channel,builtAt:ota.createdAt,publishedAt:null,commitSha:'',commits:[],otaUpdates:[]};releases.push(parent);}
    const key=`${ota.platform}:${ota.channel}:${ota.runtimeVersion}`,changes=ota.commitSha?gitChanges(ota.commitSha,previousCommit.get(key)):[];
    parent.otaUpdates.push({id:String(ota.id),version:ota.displayVersion||`${ota.runtimeVersion}.${ota.otaSequence??''}`,publishedAt:ota.createdAt,changesAt:ota.createdAt,previewOnly:false,commits:changes.length?changes:releaseComments(ota.releaseNotes,ota.commitSha)});
    if(ota.commitSha)previousCommit.set(key,ota.commitSha);
  }
  for(const item of releases)item.otaUpdates.sort((a,b)=>b.changesAt.localeCompare(a.changesAt));
  return releases.sort((a,b)=>b.version.localeCompare(a.version,undefined,{numeric:true})||b.builtAt.localeCompare(a.builtAt));
}
