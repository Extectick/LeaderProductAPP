import type {HelpAssistantActivity} from '../src/features/help/helpAssistant';
import {helpActivityLabel} from '../src/features/help/helpActivityPresentation';

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
