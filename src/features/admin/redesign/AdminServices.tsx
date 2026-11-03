import React,{useEffect,useState} from 'react';
import {View} from 'react-native';
import {useAdminData,useAdminAction,type AdminService} from './AdminDataContext';
import {DesignButton,DesignEditor,DesignEmpty,DesignField,DesignGroup,DesignHero,DesignHint,DesignList,DesignRow,DesignToggle} from './AdminDesignPrimitives';

type Service=AdminService;
export default function AdminServices({top,query,createRequest,filter}:{top:number;query:string;createRequest:number;filter:string}) {
  const {departments,roles,services,saveService}=useAdminData();
  const [draft,setDraft]=useState<Service|null>(null),[error,setError]=useState(''),[restricted,setRestricted]=useState(false);
  const {busy,run}=useAdminAction(setError);
  useEffect(()=>{if(createRequest){setDraft({id:0,key:'',name:'',kind:'LOCAL',route:'',icon:'apps',gradientStart:null,gradientEnd:null,description:'',isActive:true,defaultVisible:true,defaultEnabled:true,roleIds:[],departmentIds:[],roleAccess:[],departmentAccess:[],departmentRoleAccess:[],userAccess:[]});setRestricted(false);setError('');}},[createRequest]);
  const filtered=services.filter(item=>(item.name+' '+item.description).toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'))).filter(item=>filter==='all'||filter==='active'&&item.isActive||filter==='inactive'&&!item.isActive);
  const save=()=>{
    if(!draft)return;const name=draft.name.trim();
    if(!name){setError('Введите название сервиса');return;}
    if(services.some(item=>item.id!==draft.id&&item.name.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru'))){setError('Сервис с таким названием уже есть');return;}
    void run(async()=>{await saveService({...draft,name},restricted);setDraft(null);});
  };
  const changeAccess=(key:'roleIds'|'departmentIds',id:number,enabled:boolean)=>{if(draft)setDraft({...draft,[key]:enabled?[...draft[key],id]:draft[key].filter(value=>value!==id)});};
  return <>
    <DesignList top={top}>{filtered.map(item=><DesignRow key={item.id} title={item.name} subtitle={item.description||'Сервис компании'} meta={!item.isActive?'Выключен':!item.defaultVisible?'Скрыт из каталога':!item.defaultEnabled?'Использование запрещено':'Включён'} icon={item.icon||'apps'} mci muted={!item.isActive} onPress={()=>{setDraft({...item,roleIds:[...item.roleIds],departmentIds:[...item.departmentIds]});setRestricted(!item.defaultVisible&&!item.defaultEnabled);setError('');}}/>)}{!filtered.length&&<DesignEmpty/>}</DesignList>
    {draft&&<DesignEditor caption="Сервисы" title={draft.id?'Настройки сервиса':'Новый сервис'} onClose={()=>setDraft(null)} onSave={save} busy={busy} error={error}>
      <DesignHero title={draft.name||'Новый сервис'} subtitle={draft.isActive?'Сервис включён':'Сервис выключен'} icon={draft.icon||'apps'} mci/>
      <DesignGroup title="О сервисе">{!draft.id&&<><DesignField label="Ключ сервиса" value={draft.key} onChangeText={key=>setDraft({...draft,key})}/><DesignField label="Маршрут сервиса" value={draft.route??''} onChangeText={route=>setDraft({...draft,route})}/></>}<DesignField label="Название сервиса" value={draft.name} onChangeText={name=>{setDraft({...draft,name});setError('');}}/><DesignField label="Описание" value={draft.description??''} onChangeText={description=>setDraft({...draft,description})} multiline/></DesignGroup>
      <DesignGroup title="Доступность"><DesignToggle title="Сервис включён" description="Доступен в приложении" value={draft.isActive} onChange={isActive=>setDraft({...draft,isActive})}/><DesignToggle title="Показывать в каталоге" disabled={restricted} value={draft.defaultVisible} onChange={defaultVisible=>setDraft({...draft,defaultVisible})}/><DesignToggle title="Разрешить использование" disabled={restricted} value={draft.defaultEnabled} onChange={defaultEnabled=>setDraft({...draft,defaultEnabled})}/></DesignGroup>
      <DesignGroup title="Сотрудники"><DesignToggle title="Ограничить доступ" description={restricted?'Выбранные роли и отделы с учётом исключений':'Базовая доступность по настройкам выше'} value={restricted} onChange={value=>{setRestricted(value);setDraft({...draft,defaultVisible:!value,defaultEnabled:!value,...(!value?{roleIds:[],departmentIds:[]}: {})});setError('');}}/></DesignGroup>
      {restricted&&<><DesignGroup title="Доступ для ролей">{roles.map(role=><DesignToggle key={role.id} title={role.displayName} value={draft.roleIds.includes(role.id)} onChange={enabled=>changeAccess('roleIds',role.id,enabled)}/>)}</DesignGroup>
      <DesignHint>Выбранные роли и отделы получат доступ с учётом действующих исключений.</DesignHint>
      <DesignGroup title="Доступ для отделов">{departments.map(department=><DesignToggle key={department.id} title={department.name} value={draft.departmentIds.includes(department.id)} onChange={enabled=>changeAccess('departmentIds',department.id,enabled)}/>)}</DesignGroup></>}
      {draft.userAccess.length+draft.departmentRoleAccess.length>0&&<DesignHint>Индивидуальные исключения: {draft.userAccess.length+draft.departmentRoleAccess.length}. Они сохраняются при изменении ролей и отделов.</DesignHint>}
      <DesignButton label={draft.id?'Сохранить изменения':'Создать сервис'} onPress={save}/>
    </DesignEditor>}
  </>;
}
