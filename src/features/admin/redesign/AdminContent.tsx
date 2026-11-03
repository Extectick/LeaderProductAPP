import React,{useEffect,useState} from 'react';
import {Text} from 'react-native';
import {useHelpTheme} from '../../help/helpTheme';
import {useAdminData,type AdminDocument} from './AdminDataContext';
import {ActivityIndicator} from 'react-native';
import {DesignEditor,DesignEmpty,DesignGroup,DesignHero,DesignHint,DesignList,DesignRow} from './AdminDesignPrimitives';

type Props={top:number;query:string;filter:string};
export function AdminKnowledge({top,query,filter}:Props) {
  const t=useHelpTheme();
  const {documents:knowledgeDocuments,documentText}=useAdminData();
  const [content,setContent]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [selected,setSelected]=useState<AdminDocument|null>(null);
  useEffect(()=>{if(!selected)return;let alive=true;setContent('');setError('');setLoading(true);documentText(selected).then(text=>{if(alive)setContent(text);}).catch(error=>{if(alive)setError(error.message);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[selected?.id,documentText]);
  const filtered=knowledgeDocuments.filter(item=>filter==='all'||item.folder===filter).filter(item=>(item.title+' '+item.path).toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')));
  return <>
    <DesignList top={top}>{filtered.map(item=><DesignRow key={item.id} title={item.title} subtitle={item.path} meta={item.folder==='company'?'Используется для ответов ИИ':item.folder==='draft'?'Ожидает проверки':'Не используется для ответов'} icon={item.folder==='archive'?'archive-outline':'document-text-outline'} muted={item.folder==='archive'} onPress={()=>setSelected(item)}/>)}{!filtered.length&&<DesignEmpty title="Документы не найдены" description="Измените поиск или папку в меню" icon="documents-outline"/>}</DesignList>
    {selected&&<DesignEditor caption="База знаний" title="Просмотр документа" onClose={()=>setSelected(null)}>
      <DesignHero title={selected.title} subtitle={selected.path} icon="document-text-outline"/>
      <DesignHint>{selected.folder==='company'?'Используется для ответов ИИ':selected.folder==='draft'?'Черновик. Не используется для ответов ИИ':'Архив. Не используется для ответов ИИ'}{'\n'}Обновлено: {selected.date}</DesignHint>
      <DesignGroup title="Содержание">{loading?<ActivityIndicator style={{padding:24}} color={t.accent}/>:<Text selectable style={{padding:20,color:t.text,fontSize:16,lineHeight:25}}>{error||content}</Text>}</DesignGroup>
      <DesignHint>Документы компании добавляются и обновляются в синхронизируемой папке. Здесь доступен просмотр.</DesignHint>
    </DesignEditor>}
  </>;
}

export {default as AdminReleaseHistory} from './AdminUpdates';
