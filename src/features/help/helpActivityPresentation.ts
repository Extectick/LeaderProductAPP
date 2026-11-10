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
