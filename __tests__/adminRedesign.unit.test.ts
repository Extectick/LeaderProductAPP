import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {LiveAdminProvider} from '../src/features/admin/redesign/LiveAdminProvider';
import {useAdminData,type AdminModel} from '../src/features/admin/redesign/AdminDataContext';
import {gitChanges,mapRole,mapService,mapUser,mergeProfile,releaseHistory} from '../src/features/admin/redesign/adminModel';
import * as users from '../utils/userService';
import * as services from '../utils/servicesService';
jest.mock('../utils/userService',()=>Object.fromEntries(['getRoles','getDepartments','getPermissions','getAdminUsersPage','getProfileById','adminUpdateUser','assignUserRole','adminUpdateUserProfile','moderateEmployeeProfile','adminUpdatePassword','createDepartment','updateDepartment','deleteDepartment','createRole','updateRole','updateRolePermissions'].map(name=>[name,jest.fn()])));
jest.mock('../utils/servicesService',()=>Object.fromEntries(['getAdminServices','updateService','createAdminService','replaceServiceAccessRules'].map(name=>[name,jest.fn()])));
jest.mock('../utils/onecLpAppService',()=>({listOnecLpAppUsers:jest.fn(),listOnecLpAppPhysicalPersons:jest.fn()}));
jest.mock('../utils/apiClient',()=>({apiClient:jest.fn()}));
jest.mock('../utils/updateAdminService',()=>({getUpdatesList:jest.fn()}));
jest.mock('../src/features/knowledge/api',()=>({knowledgeApi:{}}));

const role={id:1,name:'admin',displayName:'Администратор',parentRole:null,permissions:['admin']};
const row:any={id:9,firstName:'Тест',lastName:'Пользователь',email:'',phone:null,role,moderationState:'EMPLOYEE_PENDING',employeeStatus:'PENDING',profileStatus:'ACTIVE',channels:{push:true,telegram:true,max:false},departmentId:2,departmentName:'IT'};
const profile:any={...row,middleName:null,avatarUrl:null,employeeProfile:{status:'PENDING',department:{id:2,name:'IT'},onecUserGuid:'u',onecPhysicalPersonGuid:'p'},clientProfile:null,supplierProfile:null,telegramId:'123456',maxId:'654321'};
const service:any={id:7,key:'help',name:'Помощь',kind:'LOCAL',route:'/services/help',description:'Поддержка',icon:null,gradientStart:null,gradientEnd:null,isActive:true,defaultVisible:true,defaultEnabled:true,roleAccess:[{id:1,roleId:2,visible:false,enabled:false}],departmentAccess:[],departmentRoleAccess:[{id:2,departmentId:3,roleId:4,visible:false,enabled:false}],userAccess:[{id:3,userId:11,visible:false,enabled:false}]};
let model:AdminModel,tree:Renderer.ReactTestRenderer;
function Probe(){model=useAdminData();return null;}
beforeEach(()=>{
  jest.resetAllMocks();
  (users.getRoles as jest.Mock).mockResolvedValue([role]);(users.getDepartments as jest.Mock).mockResolvedValue([{id:2,name:'IT'}]);(users.getPermissions as jest.Mock).mockResolvedValue([{name:'admin',displayName:'Администрирование'}]);
  (users.getAdminUsersPage as jest.Mock).mockResolvedValue({items:[row],meta:{hasNext:false,total:1}});
  (users.getProfileById as jest.Mock).mockResolvedValue(profile);(services.getAdminServices as jest.Mock).mockResolvedValue([service]);
});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());});
async function mount(){await act(async()=>{tree=Renderer.create(React.createElement(LiveAdminProvider,{children:React.createElement(Probe)}));});}
test('reads every server page and preserves pending/profile state',async()=>{
  (users.getAdminUsersPage as jest.Mock).mockResolvedValueOnce({items:[row],meta:{hasNext:true}}).mockResolvedValueOnce({items:[{...row,id:10}],meta:{hasNext:false}});
  await mount();expect(model.loading).toBe(false);expect(model.users.map(user=>user.id)).toEqual([9,10]);expect(users.getAdminUsersPage).toHaveBeenLastCalledWith(expect.objectContaining({page:2,limit:100}));
});
test('loads the full profile including channel IDs and clears absent employee bindings',()=>{
  const user=mapUser(row,[mapRole(role)]);expect(mergeProfile(user,profile,[mapRole(role)]).channelAccounts).toEqual({telegramUserId:'123456',maxUserId:'654321'});
  const without=mergeProfile(user,{...profile,employeeProfile:null},[mapRole(role)]);expect(without.hasEmployeeProfile).toBe(false);expect(without.onecUserGuid).toBeNull();
});
test('edits only changed fields and uses the dedicated role/profile endpoints',async()=>{
  await mount();const original=mergeProfile(model.users[0],profile,model.roles),draft={...original,firstName:'Новое имя',role:{...original.role,id:4},departmentId:3,onecUserGuid:'new-guid'};
  await act(async()=>{await model.saveUser(draft,original);});
  expect(users.adminUpdateUser).toHaveBeenCalledWith(9,{firstName:'Новое имя',onecUserGuid:'new-guid'});expect(users.assignUserRole).toHaveBeenCalledWith(9,{roleId:4});expect(users.adminUpdateUserProfile).toHaveBeenCalledWith(9,'employee',{departmentId:3,status:'PENDING'});
});
test('metadata edits never replace existing access rules',async()=>{
  await mount();await act(async()=>{await model.loadResource('services');});await act(async()=>{await model.saveService({...model.services[0],name:'Новое название'},false);});
  expect(services.updateService).toHaveBeenCalledWith(7,expect.objectContaining({name:'Новое название',defaultVisible:true,defaultEnabled:true}));expect(services.replaceServiceAccessRules).not.toHaveBeenCalled();
});
test('restricts defaults and retains explicit denies and advanced exceptions',async()=>{
  await mount();await act(async()=>{await model.loadResource('services');});await act(async()=>{await model.saveService({...model.services[0],roleIds:[5]},true);});
  expect(services.updateService).toHaveBeenCalledWith(7,expect.objectContaining({defaultVisible:false,defaultEnabled:false}));
  expect(services.replaceServiceAccessRules).toHaveBeenCalledWith(7,expect.objectContaining({roleAccess:[service.roleAccess[0],{roleId:5,visible:true,enabled:true}],departmentRoleAccess:service.departmentRoleAccess,userAccess:service.userAccess}));
});
test('failed password reset rejects without retaining a password in model state',async()=>{
  await mount();(users.adminUpdatePassword as jest.Mock).mockRejectedValue(Error('Сеть недоступна'));
  await expect(model.resetPassword(9,'fixture-only')).rejects.toThrow('Сеть недоступна');expect(JSON.stringify(model)).not.toContain('fixture-only');
});
test('retry after a partial service create resumes the same record',async()=>{
  await mount();(services.createAdminService as jest.Mock).mockResolvedValue({service:{id:99}});(services.replaceServiceAccessRules as jest.Mock).mockRejectedValueOnce(Error('Сеть недоступна'));
  const draft={...mapService(service),id:0,key:'qa_created',roleIds:[5]};
  await expect(model.saveService(draft,true)).rejects.toThrow('Сеть недоступна');
  await act(async()=>{await model.saveService(draft,true);});
  expect(services.createAdminService).toHaveBeenCalledTimes(1);expect(services.updateService).toHaveBeenCalledWith(99,expect.anything());
});
test('role permission errors propagate instead of reporting a successful save',async()=>{
  await mount();(users.updateRolePermissions as jest.Mock).mockRejectedValue(Error('Запрещено'));await expect(model.saveRole(mapRole(role))).rejects.toThrow('Запрещено');
});
test('OTA grouping never mixes platforms or channels and retains orphan runtime history',()=>{
  const apk:any={id:1,versionName:'1.0',versionCode:1,platform:'ANDROID',channel:'dev',createdAt:'2026-11-01',releaseNotes:'Сборка'};
  const ota:any={id:1,platform:'ANDROID',channel:'dev',runtimeVersion:'1.0',createdAt:'2026-11-02',displayVersion:'1.0.1',releaseNotes:'Исправление'};
  const history=releaseHistory([apk],[ota,{...ota,id:2,channel:'prod'},{...ota,id:3,platform:'IOS'}]);expect(history).toHaveLength(3);expect(history.find(item=>item.id==='1')!.otaUpdates.map(item=>item.id)).toEqual(['1']);expect(history.flatMap(item=>item.otaUpdates).every(item=>!item.previewOnly)).toBe(true);
});
test('Git notes use ancestry, exclude prior history and omit merge subjects',()=>{
  const catalog={a:{parents:[],date:'1',subject:'old'},b:{parents:['a'],date:'2',subject:'fix B'},c:{parents:['a'],date:'3',subject:'fix C'},d:{parents:['b','c'],date:'4',subject:'merge'}};
  expect(gitChanges('d','a',catalog).map(item=>item.subject)).toEqual(['fix C','fix B']);expect(gitChanges('missing','a',catalog)).toEqual([]);
});
