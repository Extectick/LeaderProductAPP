/** Local design data only. There is deliberately no fetch, token or API fallback. */
export const departments = [{id:1,name:'IT'},{id:2,name:'Продажи'},{id:3,name:'Склад'},{id:4,name:'Бухгалтерия'}];
export type PreviewRole={id:number;name:string;displayName:string;parentRole:number|null;permissions:string[]};
export const roles:PreviewRole[] = [
  {id:1,name:'admin',displayName:'Администратор',parentRole:null,permissions:['admin','manage_users']},
  {id:2,name:'manager',displayName:'Менеджер',parentRole:null,permissions:['view_client_orders','manage_client_orders']},
  {id:3,name:'employee',displayName:'Сотрудник',parentRole:null,permissions:['view_help']},
  {id:4,name:'it',displayName:'Специалист IT',parentRole:null,permissions:['manage_help']},
];
const names=[['Алексей','Белов'],['Анна','Кузнецова'],['Михаил','Соколов'],['Елена','Морозова'],['Дмитрий','Волков'],['Ольга','Петрова'],['Иван','Смирнов'],['Мария','Лебедева'],['Артём','Попов'],['Ирина','Новикова'],['Сергей','Орлов'],['Наталья','Михайлова']];
const middleNames=['Сергеевич','Викторовна','Андреевич','Сергеевна','Игоревич','Алексеевна','Петрович','Ивановна','Дмитриевич','Олеговна','Михайлович','Павловна'];
export const onecPhysicalPersons=names.map(([first,last],i)=>({guid:`20000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,name:`${last} ${first} ${middleNames[i]}`,code:String(i+1).padStart(6,'0')}));
export const onecUsers=onecPhysicalPersons.map((person,i)=>({guid:`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,name:person.name,physicalPersonGuid:person.guid,physicalPersonName:person.name,inactive:i===4}));
export const users=names.map(([firstName,lastName],i)=>({
  id:101+i,email:`demo${i+1}@example.invalid`,firstName,lastName,middleName:null,phone:null,avatarUrl:null,
  profileStatus:i===1?'PENDING':i===4?'BLOCKED':'ACTIVE',currentProfileType:'EMPLOYEE',isActive:true,
  departmentId:i%4+1,departmentName:departments[i%4].name,role:roles[i%4],
  employeeStatus:i===1?'PENDING':i===4?'BLOCKED':'ACTIVE',moderationState:i===1?'EMPLOYEE_PENDING':i===4?'EMPLOYEE_BLOCKED':'EMPLOYEE_ACTIVE',
  onecUserGuid:(i===0?onecUsers[0].guid:null) as string|null,onecPhysicalPersonGuid:(i===0?onecPhysicalPersons[0].guid:null) as string|null,
  onecUserName:(i===0?onecUsers[0].name:null) as string|null,onecPhysicalPersonName:(i===0?onecPhysicalPersons[0].name:null) as string|null,
  channelAccounts:{telegramUserId:i%3===0?String(9000000101+i):null,maxUserId:i%4===0?String(8000000101+i):null},
  isOnline:i%3===0,lastSeenAt:'2026-11-03T09:00:00Z',createdAt:'2026-10-25T08:00:00Z',channels:{push:i%2===0,telegram:i%3===0,max:i%4===0}
}));
export type PreviewUser=typeof users[number];
/** Only reset metadata is retained for this design demo; never the entered password. */
export const passwordResetRecords=new Map<number,{changedAt:number}>();
export const services=['Помощь','Заказы клиентов','Транспортные задачи','Остатки на складах'].map((name,i)=>({
  id:i+1,key:['help','client_orders','transport_tasks','stock_balances'][i],name,kind:'LOCAL',route:['/services/help','/services/client-orders','/services/transport-tasks','/services/stock'][i],
  icon:['comment-question-outline','file-document-outline','truck-outline','warehouse'][i],description:['Поддержка сотрудников и чат с IT','Работа с заказами и документами','Задачи на доставку и перемещение','Доступные товары по складам'][i],isActive:true,defaultVisible:true,defaultEnabled:true,roleIds:[] as number[],departmentIds:[] as number[],roleAccess:[],departmentAccess:[],departmentRoleAccess:[],userAccess:[]
}));
const groups=[{id:1,key:'core',displayName:'Основные',description:'Базовые права',isSystem:true,sortOrder:10,service:null}];
const permissions=[{id:1,name:'manage_users',displayName:'Управление пользователями',group:groups[0]},{id:2,name:'manage_help',displayName:'Работа с обращениями',group:groups[0]},{id:3,name:'manage_client_orders',displayName:'Заказы клиентов',group:groups[0]}];
function profile(user:any){return {...user,departmentRoles:[],permissions:user.role.permissions,employeeProfile:{status:user.employeeStatus,department:departments.find(d=>d.id===user.departmentId),onecUserGuid:null,onecPhysicalPersonGuid:null},clientProfile:null,supplierProfile:null};}
export async function apiClient<Req=undefined,Res=any>(raw:string,options:{method?:string;body?:any}={}):Promise<{ok:boolean;status:number;data?:Res;message?:string}> {
  const url=new URL(raw,'https://admin-fixture.invalid'), path=url.pathname, method=options.method||'GET', body=options.body||{};
  let data:any;
  if(path==='/users/admin/list'){
    const search=(url.searchParams.get('search')||'').toLowerCase();
    const filtered=users.filter(u=>(u.firstName+' '+u.lastName+' '+u.email).toLowerCase().includes(search))
      .filter(u=>!url.searchParams.get('moderationState')||u.moderationState===url.searchParams.get('moderationState'))
      .filter(u=>!url.searchParams.get('online')||(url.searchParams.get('online')==='online')===u.isOnline);
    data={items:filtered,meta:{total:filtered.length,page:1,limit:20,hasNext:false}};
  }else if(path==='/users/roles'){
    if(method==='POST')roles.push({id:Date.now(),parentRole:null,permissions:[],...body});data=roles;
  }else if(/^\/users\/roles\/\d+$/.test(path)){
    const id=Number(path.split('/').pop()),index=roles.findIndex(r=>r.id===id);
    if(method==='DELETE'&&index>=0)roles.splice(index,1);else if(index>=0)Object.assign(roles[index],body);data=roles[index]||{};
  }else if(path==='/users/permissions')data=permissions;
  else if(path==='/users/permission-groups')data=groups;
  else if(path==='/users/departments'){
    if(method==='POST')departments.push({id:Date.now(),name:body.name});data=departments;
  }else if(/^\/users\/departments\/\d+\/users$/.test(path))data=users.filter(u=>u.departmentId===Number(path.split('/')[3]));
  else if(/^\/users\/departments\/\d+$/.test(path)){
    const id=Number(path.split('/').pop()),index=departments.findIndex(d=>d.id===id);
    if(method==='DELETE'&&index>=0)departments.splice(index,1);else if(index>=0)Object.assign(departments[index],body);data=departments;
  }else if(/^\/users\/\d+/.test(path)){
    const user=users.find(u=>u.id===Number(path.split('/')[2]));
    if(!user)return {ok:false,status:404,message:'Тестовый пользователь не найден'};
    if(path.endsWith('employee-moderation')){
      const approved=body.action==='APPROVE';user.employeeStatus=approved?'ACTIVE':'BLOCKED';user.moderationState=approved?'EMPLOYEE_ACTIVE':'EMPLOYEE_BLOCKED';
      data={profile:profile(user),moderation:{action:body.action,employeeStatusAfter:user.employeeStatus},notification:{pushSent:false,telegramSent:false,maxSent:false,skipped:['local-design-fixture']}};
    }else{if(method!=='GET')Object.assign(user,body);data={profile:profile(user)};}
  }else if(path==='/users/profile')data={profile:profile(users[0])};
  else if(path==='/services/admin'||path==='/services')data={services};
  else if(/^\/services\/\d+$/.test(path)){
    const service=services.find(s=>s.id===Number(path.split('/')[2]));if(service&&method!=='GET')Object.assign(service,body);data={service};
  }else if(path.includes('access-catalog'))data={items:services.map(s=>({...s,service:s,visible:true,enabled:true})),roles};
  else if(path.startsWith('/updates'))data={data:[],total:0};
  else if(path==='/knowledge/config')data={enabled:false,canReview:false};
  else if(path==='/knowledge/sources')data=[];
  else if(path.startsWith('/knowledge/documents'))data={items:[],hasMore:false};
  else return {ok:false,status:503,message:`Этот сценарий ещё не добавлен в локальный стенд: ${method} ${path}`};
  return {ok:true,status:200,data:data as Res};
}
