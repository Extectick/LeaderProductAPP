import type {HelpAssistantActivity} from './helpAssistant';

/** Present only server-emitted search facts; other activities keep their meaning. */
export function helpActivityLabel(item:HelpAssistantActivity):string {
  if(item.kind!=='knowledge')return item.label;
  const label=item.label.trim();
  if(label==='Ищу инструкции компании' || label==='Подходящей инструкции нет — общая диагностика' || label==='Подходящей инструкции нет - общая диагностика')return 'Поиск инструкций';
  if(item.status==='completed'){
    // The server supplies the count of retrieved sources in this public label.
    const match=/^Найдены инструкции:\s*(\d+)$/u.exec(label);
    if(match){
      const count=Number(match[1]);
      if(Number.isSafeInteger(count))return count>0?`Поиск инструкций · найдено ${count}`:'Поиск инструкций';
    }
  }
  return item.label;
}

export type HelpActivityRow={key:string;item:HelpAssistantActivity;count:number};

/** Compact repeated service facts without rewriting the server's activity history. */
export function helpActivityRows(activities:HelpAssistantActivity[]):HelpActivityRow[] {
  const rows:HelpActivityRow[]=[],groups=new Map<string,HelpActivityRow>();
  for(const item of activities){
    // Reasoning, details and unsuccessful outcomes keep their own identity and
    // evidence. Only plain successful/pending service labels can be combined.
    const groupable=item.kind!=='analysis'&&!item.text?.trim()
      &&(item.status==='running'||item.status==='completed');
    if(!groupable){
      rows.push({key:JSON.stringify(['activity',item.id]),item,count:1});
      continue;
    }
    const key=JSON.stringify(['service',item.kind,helpActivityLabel(item).trim()]);
    const existing=groups.get(key);
    if(existing){
      existing.count+=1;
      // A group stays loading until every member is finished. Reuse an actual
      // running item rather than inventing a server status or completion time.
      if(existing.item.status!=='running'&&item.status==='running')existing.item=item;
    }else{
      const row={key,item,count:1};groups.set(key,row);rows.push(row);
    }
  }
  // Completed facts retain first-appearance order; current work follows them.
  // Broad model status belongs at the bottom, below concrete running actions.
  return [
    ...rows.filter(row=>row.item.status!=='running'),
    ...rows.filter(row=>row.item.status==='running'&&row.item.kind!=='status'),
    ...rows.filter(row=>row.item.status==='running'&&row.item.kind==='status'),
  ];
}
