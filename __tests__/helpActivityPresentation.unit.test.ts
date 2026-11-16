import type {HelpAssistantActivity} from '../src/features/help/helpAssistant';
import {helpActivityLabel,helpActivityRows} from '../src/features/help/helpActivityPresentation';

const activity=(label:string,extra:Partial<HelpAssistantActivity>={}):HelpAssistantActivity=>({id:'knowledge',kind:'knowledge',status:'completed',label,...extra});

test('actual knowledge search and zero-result fallback have one compact search label',()=>{
  expect(helpActivityLabel(activity('Ищу инструкции компании',{status:'running'}))).toBe('Поиск инструкций');
  expect(helpActivityLabel(activity('Подходящей инструкции нет — общая диагностика'))).toBe('Поиск инструкций');
  expect(helpActivityLabel(activity('Подходящей инструкции нет - общая диагностика'))).toBe('Поиск инструкций');
});

test('completed search shows exactly the count reported by the server',()=>{
  expect(helpActivityLabel(activity('Найдены инструкции: 3'))).toBe('Поиск инструкций · найдено 3');
  expect(helpActivityLabel(activity('Найдены инструкции: 12'))).toBe('Поиск инструкций · найдено 12');
  expect(helpActivityLabel(activity('Найдены инструкции: 0'))).toBe('Поиск инструкций');
});

test('unknown, failed, unavailable and unrelated activities retain their actual labels',()=>{
  for(const label of ['Инструкции временно недоступны','Требуется помощь специалиста IT','Читаю инструкцию','Найдены инструкции: неизвестно','Найдены инструкции: 9007199254740992'])expect(helpActivityLabel(activity(label))).toBe(label);
  expect(helpActivityLabel(activity('Найдены инструкции: 3',{status:'failed'}))).toBe('Найдены инструкции: 3');
  expect(helpActivityLabel(activity('Подходящей инструкции нет — общая диагностика',{kind:'analysis'}))).toBe('Подходящей инструкции нет — общая диагностика');
  expect(helpActivityLabel(activity('Найдены инструкции: 2',{kind:'tool'}))).toBe('Найдены инструкции: 2');
});

const service=(id:string,label:string,extra:Partial<HelpAssistantActivity>={}):HelpAssistantActivity=>({id,kind:'tool',status:'completed',label,...extra});

test('repeated 1C service results collapse to accurate counts in first-appearance order',()=>{
  const rows=helpActivityRows([
    service('a','Получен результат проверки 1С'),
    service('b','Получен результат проверки 1С'),
    service('c','Проверена структура данных 1С'),
    service('d','Проверена структура данных 1С'),
    service('e','Получен результат проверки 1С'),
    service('f',' Получен результат проверки 1С '),
  ]);
  expect(rows.map(row=>[helpActivityLabel(row.item),row.count])).toEqual([
    ['Получен результат проверки 1С',4],['Проверена структура данных 1С',2],
  ]);
});

test('a mixed group stays loading with a stable key until all requests complete',()=>{
  const completed=service('a','Проверка 1С'),running=service('b','Проверка 1С',{status:'running'});
  const mixed=helpActivityRows([completed,running])[0];
  expect(mixed.count).toBe(2);expect(mixed.item).toBe(running);
  const finished=helpActivityRows([completed,{...running,status:'completed'}])[0];
  expect(finished.count).toBe(2);expect(finished.item.status).toBe('completed');
  expect(finished.key).toBe(mixed.key);
  expect(helpActivityRows([completed])[0].key).toBe(mixed.key);
});

test('running actions follow completed steps and generic model loading is last',()=>{
  const rows=helpActivityRows([
    service('model','ИИ обрабатывает запрос',{kind:'status',status:'running'}),
    service('running','Чтение 1С',{status:'running'}),
    service('a','Поиск инструкций'),service('b','Вложение прочитано'),
    service('other','Другой запрос',{status:'running'}),
  ]);
  expect(rows.map(row=>row.item.id)).toEqual(['a','b','running','other','model']);
});

test('failed and stopped requests never disappear into successful or loading groups',()=>{
  const rows=helpActivityRows([
    service('done','Запрос 1С'),service('failed','Запрос 1С',{status:'failed'}),
    service('stopped','Запрос 1С',{status:'stopped'}),service('pending','Запрос 1С',{status:'running'}),
  ]);
  expect(rows.map(row=>[row.item.status,row.count])).toEqual([['failed',1],['stopped',1],['running',2]]);
  expect(new Set(rows.map(row=>row.key)).size).toBe(3);
});

test('reasoning and text-bearing service activities retain distinct text and stable identities',()=>{
  const entries=[
    service('analysis-a','Кратко об анализе',{kind:'analysis',text:'Первая проверка'}),
    service('analysis-b','Кратко об анализе',{kind:'analysis',text:'Вторая проверка'}),
    service('analysis-empty','Кратко об анализе',{kind:'analysis',status:'running'}),
    service('detail-a','Проверка',{text:'Один результат'}),
    service('detail-b','Проверка',{text:'Другой результат'}),
  ];
  const rows=helpActivityRows(entries);
  expect(rows).toHaveLength(5);expect(rows.every(row=>row.count===1)).toBe(true);
  for(const item of entries)expect(rows.find(row=>row.item===item)).toBeDefined();
  const before=rows.find(row=>row.item.id==='analysis-empty')!;
  const after=helpActivityRows([{...entries[2],text:'Новый текст',status:'completed'}])[0];
  expect(after.key).toBe(before.key);
});

test('different activity kinds do not merge even with identical labels',()=>{
  const rows=helpActivityRows([
    service('tool','Проверка'),service('knowledge','Проверка',{kind:'knowledge'}),
    service('status','Проверка',{kind:'status'}),
  ]);
  expect(rows).toHaveLength(3);expect(new Set(rows.map(row=>row.key)).size).toBe(3);
});

test('presentation does not mutate frozen input arrays or source activities',()=>{
  const entries=[service('a','Проверка'),service('b','Проверка',{status:'running'}),service('c','Другая проверка')];
  const snapshot=JSON.stringify(entries);
  entries.forEach(Object.freeze);Object.freeze(entries);
  expect(()=>helpActivityRows(entries)).not.toThrow();
  expect(JSON.stringify(entries)).toBe(snapshot);
});
