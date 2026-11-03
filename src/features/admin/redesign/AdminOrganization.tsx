import React,{useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {useAdminData,useAdminAction,type AdminRole} from './AdminDataContext';
import {inheritedPermissions,canInheritRole} from './adminModel';
import {DesignButton,DesignChoice,DesignEditor,DesignEmpty,DesignField,DesignGroup,DesignHero,DesignHint,DesignList,DesignOption,DesignRow,DesignSheet,DesignToggle} from './AdminDesignPrimitives';

type Props={top:number;query:string;createRequest:number};
export const employeeCount=(count:number)=>`${count} ${count%10===1&&count%100!==11?'сотрудник':count%10>=2&&count%10<=4&&(count%100<12||count%100>14)?'сотрудника':'сотрудников'}`;
const permissionCount=(count:number)=>`${count} ${count%10===1&&count%100!==11?'разрешение':count%10>=2&&count%10<=4&&(count%100<12||count%100>14)?'разрешения':'разрешений'}`;
const matches=(text:string,query:string)=>text.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'));

export function AdminDepartments({top,query,createRequest,onOpenUser}:Props&{onOpenUser:(id:number)=>void}) {
  const {departments,users,saveDepartment,deleteDepartment}=useAdminData();
  const [draft,setDraft]=useState<{id:number;name:string}|null>(null),[error,setError]=useState(''),[confirm,setConfirm]=useState(false);
  const {busy,run}=useAdminAction(setError);
  useEffect(()=>{if(createRequest){setDraft({id:0,name:''});setError('');}},[createRequest]);
  const save=()=>{
    if(!draft)return;const name=draft.name.trim();
    if(!name){setError('Введите название отдела');return;}
    if(departments.some(item=>item.id!==draft.id&&item.name.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru'))){setError('Отдел с таким названием уже есть');return;}
    void run(async()=>{await saveDepartment({id:draft.id,name});setDraft(null);});
  };
  const filtered=departments.filter(item=>matches(item.name,query));
  const staff=users.filter(user=>user.departmentId===draft?.id);
  return <>
    <DesignList top={top}>{filtered.map(item=><DesignRow key={item.id} title={item.name} subtitle={employeeCount(users.filter(user=>user.departmentId===item.id).length)} icon="business-outline" onPress={()=>{setDraft({...item});setError('');}}/>)}{!filtered.length&&<DesignEmpty/>}</DesignList>
    {draft&&<DesignEditor caption="Отделы" title={draft.id?'Карточка отдела':'Новый отдел'} onClose={()=>setDraft(null)} onSave={save} busy={busy} error={error}>
      <DesignHero title={draft.name||'Новый отдел'} subtitle={draft.id?employeeCount(staff.length):'Сотрудников можно добавить после создания'} icon="business-outline"/>
      <DesignGroup title="Об отделе"><DesignField label="Название отдела" value={draft.name} onChangeText={name=>{setDraft({...draft,name});setError('');}}/></DesignGroup>
      {!!draft.id&&<DesignGroup title="Сотрудники">{staff.length?staff.map(user=><DesignRow key={user.id} title={`${user.lastName} ${user.firstName}`} subtitle={user.role.displayName} icon="person-outline" onPress={()=>{setDraft(null);onOpenUser(user.id);}}/>):<DesignHint>В этом отделе пока нет сотрудников.</DesignHint>}</DesignGroup>}
      <DesignButton label={draft.id?'Сохранить изменения':'Создать отдел'} onPress={save}/>
      {!!draft.id&&!staff.length&&<DesignButton label="Удалить отдел" secondary danger onPress={()=>setConfirm(true)}/>}
      {confirm&&<DesignSheet title="Удалить пустой отдел?" onClose={()=>setConfirm(false)}><DesignHint>Отдел «{draft.name}» будет удалён из списка.</DesignHint><DesignButton label="Удалить" danger onPress={()=>{void run(async()=>{await deleteDepartment(draft.id);setConfirm(false);setDraft(null);});}}/></DesignSheet>}
    </DesignEditor>}
  </>;
}

export function AdminRoles({top,query,createRequest}:Props) {
  const {roles,users,permissionOptions,saveRole}=useAdminData();
  const effectivePermissions=(role:AdminRole)=>inheritedPermissions(role,roles,permissionOptions.map(item=>item.key));
  const canInherit=(id:number,role:AdminRole)=>canInheritRole(id,role,roles);
  const [draft,setDraft]=useState<AdminRole|null>(null),[error,setError]=useState(''),[picker,setPicker]=useState(false);
  const {busy,run}=useAdminAction(setError);
  useEffect(()=>{if(createRequest){setDraft({id:0,name:'',displayName:'',parentRole:null,permissions:[]});setError('');}},[createRequest]);
  const filtered=roles.filter(item=>matches(item.displayName,query));
  const parent=roles.find(item=>item.id===draft?.parentRole);
  const inherited=parent?effectivePermissions(parent):new Set<string>();
  const save=()=>{
    if(!draft)return;const displayName=draft.displayName.trim();
    if(!displayName){setError('Введите название роли');return;}
    if(roles.some(item=>item.id!==draft.id&&item.displayName.toLocaleLowerCase('ru')===displayName.toLocaleLowerCase('ru'))){setError('Роль с таким названием уже есть');return;}
    const candidate=roles.find(item=>item.id===draft.parentRole);
    if(candidate&&!canInherit(draft.id,candidate)){setError('Нельзя создавать круговое наследование ролей');return;}
    void run(async()=>{await saveRole({...draft,displayName});setDraft(null);});
  };
  return <>
    <DesignList top={top}>{filtered.map(item=><DesignRow key={item.id} title={item.displayName} subtitle={employeeCount(users.filter(user=>user.role.id===item.id).length)} meta={item.parentRole?`Наследует: ${roles.find(role=>role.id===item.parentRole)?.displayName??'—'}`:permissionCount(effectivePermissions(item).size)} icon="shield-checkmark-outline" onPress={()=>{setDraft({...item,permissions:[...item.permissions]});setError('');}}/>)}{!filtered.length&&<DesignEmpty/>}</DesignList>
    {draft&&<DesignEditor caption="Роли и права" title={draft.id?'Карточка роли':'Новая роль'} onClose={()=>setDraft(null)} onSave={save} busy={busy} error={error}>
      <DesignHero title={draft.displayName||'Новая роль'} subtitle={draft.name==='admin'?'Полный доступ к приложению':'Права и наследование доступа'} icon="shield-checkmark-outline"/>
      <DesignGroup title="Роль"><DesignField label="Название роли" value={draft.displayName} onChangeText={displayName=>{setDraft({...draft,displayName});setError('');}}/>{draft.name!=='admin'&&<DesignChoice title="Наследовать права" value={parent?.displayName??'Без наследования'} onPress={()=>setPicker(true)}/>}</DesignGroup>
      <DesignGroup title="Разрешения">{permissionOptions.map(item=>{const locked=draft.name==='admin'||inherited.has(item.key);return <DesignToggle key={item.key} title={item.label} description={draft.name==='admin'?'Системная роль':inherited.has(item.key)?`Унаследовано от «${parent?.displayName}»`:undefined} value={locked||draft.permissions.includes(item.key)} disabled={locked} onChange={checked=>setDraft({...draft,permissions:checked?[...draft.permissions,item.key]:draft.permissions.filter(key=>key!==item.key)})}/>;})}</DesignGroup>
      <DesignButton label={draft.id?'Сохранить изменения':'Создать роль'} onPress={save}/>
      {picker&&<DesignSheet title="Наследовать права" onClose={()=>setPicker(false)}><DesignOption title="Без наследования" selected={draft.parentRole===null} onPress={()=>{setDraft({...draft,parentRole:null});setPicker(false);}}/>{roles.filter(item=>canInherit(draft.id,item)).map(item=><DesignOption key={item.id} title={item.displayName} selected={draft.parentRole===item.id} onPress={()=>{setDraft({...draft,parentRole:item.id});setPicker(false);}}/>)}</DesignSheet>}
    </DesignEditor>}
  </>;
}
