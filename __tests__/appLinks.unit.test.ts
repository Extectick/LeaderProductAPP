import {classifyAppLink,openAppLink,parseAppHelpDestination} from '../src/shared/appLinks';
const profile='leaderproduct://entity/v1/user/121',artifact='12345678-1234-4234-8234-123456789abc';
test('classifies public sites without treating them as app entities or credentials',()=>{
 expect(classifyAppLink('https://tass.ru/')).toEqual({kind:'web',url:'https://tass.ru/'});
 for(const value of ['javascript:alert(1)','file:///secret','data:text/html,hello','https://user:secret@tass.ru/','https://tass.ru\\@other.test','leaderproduct://entity/v2/user/121'])expect(classifyAppLink(value)).toBeNull();
});
test('one dispatcher preserves internal entities, Help chat and bounded HTML ownership',()=>{
 const handlers={openEntity:jest.fn(()=>true),openWeb:jest.fn(()=>true),openChat:jest.fn(),canOpenHtml:jest.fn(()=>false),openHtml:jest.fn(),openSystem:jest.fn()};
 expect(openAppLink(profile,handlers,'Профиль')).toBe(true);expect(handlers.openEntity).toHaveBeenCalledWith({v:1,source:'app',kind:'user',id:'121'},'Профиль');
 expect(openAppLink('leaderproduct://services/help?ticketId=81',handlers)).toBe(true);expect(handlers.openChat).toHaveBeenCalledWith(81);
 expect(openAppLink('leaderproduct://help-html/'+artifact,handlers)).toBe(false);expect(handlers.openHtml).not.toHaveBeenCalled();
 handlers.canOpenHtml.mockReturnValue(true);expect(openAppLink('leaderproduct://help-html/'+artifact,handlers)).toBe(true);expect(handlers.openHtml).toHaveBeenCalledWith(artifact);
 expect(openAppLink('https://tass.ru/',handlers,'ТАСС')).toBe(true);expect(handlers.openWeb).toHaveBeenCalledWith('https://tass.ru/','ТАСС');
 expect(openAppLink('mailto:employee@example.test',handlers)).toBe(true);expect(handlers.openSystem).toHaveBeenCalledWith('mailto:employee@example.test');
});
test('missing or rejecting web viewer never silently opens an external application',()=>{
 const openSystem=jest.fn(),openEntity=jest.fn(()=>false);
 expect(openAppLink('https://tass.ru/',{openEntity,openSystem})).toBe(false);expect(openSystem).not.toHaveBeenCalled();
 expect(openAppLink('mailto:someone@example.test?subject=%0aBcc:other@example.test',{openEntity,openSystem})).toBe(false);
});
test('copied full HTML permalinks navigate through a strictly bounded protected Help destination',()=>{
 const destination={ticketId:81,messageId:1323,htmlId:artifact};
 const url=`leaderproduct://services/help?ticketId=81&messageId=1323&htmlId=${artifact}`;
 expect(classifyAppLink(url)).toEqual({kind:'help-destination',destination});
 const openHelpDestination=jest.fn(),openEntity=jest.fn(()=>false);expect(openAppLink(url,{openEntity,openHelpDestination})).toBe(true);expect(openHelpDestination).toHaveBeenCalledWith(destination);
 for(const bad of [url+'&ticketId=82',url+'&extra=1',url.replace('messageId=1323','messageId=0'),url.replace('/help?','/other/../help?'),url.replace(artifact,'12345678-1234-1234-1234-123456789abc'),url+'#fragment',url.replace('ticketId=81','ticketId=2147483648')])expect(classifyAppLink(bad)).toBeNull();
 expect(parseAppHelpDestination(null)).toBeNull();expect(parseAppHelpDestination(url.replace('ticketId=81','ticketId=8\n1'))).toBeNull();
 expect(classifyAppLink(`leaderproduct://services/help?ticketId=81&htmlId=${artifact}`)).toEqual({kind:'help-destination',destination:{ticketId:81,htmlId:artifact}});
});

const orderGuid='b8b8cb5c-d9b9-11f1-9d3e-f6ac37589664';
const orderQuery=`orderGuid=${orderGuid}&orderBaseKey=torg2026`;
const orderRoute=`https://app.dev.lidprod.ru/services/client_orders?${orderQuery}`;
const orderTarget={v:1,source:'onec',baseKey:'torg2026',metaType:'Documents',name:'ЗаказКлиента',guid:orderGuid};

test('copied order service URLs open the typed viewer with their original base',()=>{
 for(const prefix of ['https://app.dev.lidprod.ru/services/client_orders','leaderproduct://services/client_orders']){
  expect(classifyAppLink(`${prefix}?${orderQuery}`)).toEqual({kind:'entity',target:orderTarget});
  expect(classifyAppLink(`${prefix}?orderBaseKey=branch-2026&orderGuid=${orderGuid.toUpperCase()}`)).toEqual({kind:'entity',target:{...orderTarget,baseKey:'branch-2026'}});
 }
 const openEntity=jest.fn(()=>true),openWeb=jest.fn(()=>true);
 expect(openAppLink(orderRoute,{openEntity,openWeb},'Заказ')).toBe(true);
 expect(openEntity).toHaveBeenCalledWith(orderTarget,'Заказ');
 expect(openWeb).not.toHaveBeenCalled();
});

test('external lookalikes and other browser routes never become order entities',()=>{
 for(const prefix of [
  'https://app.dev.lidprod.ru.other.test/services/client_orders',
  'https://other.test/services/client_orders',
  'https://app.lidprod.ru/services/client_orders',
  'http://app.dev.lidprod.ru/services/client_orders',
  'https://app.dev.lidprod.ru:8443/services/client_orders',
  'https://app.dev.lidprod.ru/services/client_orders/extra',
  'https://app.dev.lidprod.ru/services/other/../client_orders',
  'https://app.dev.lidprod.ru/services/%63lient_orders',
 ]){
  const url=`${prefix}?${orderQuery}`;
  expect(classifyAppLink(url)).toEqual({kind:'web',url:new URL(url).href});
 }
 expect(classifyAppLink(`https://app.dev.lidprod.ru@other.test/services/client_orders?${orderQuery}`)).toBeNull();
 expect(classifyAppLink(`leaderproduct://services/other/../client_orders?${orderQuery}`)).toBeNull();
});

test('order click mapping requires an unambiguous complete identity without inventing a base',()=>{
 for(const query of [
  `orderGuid=${orderGuid}`,`orderBaseKey=torg2026`,
  `orderGuid=${orderGuid}&orderBaseKey=`,
  `${orderQuery}&orderBaseKey=other`,`${orderQuery}&orderBaseKey=torg2026`,
  `${orderQuery}&orderGuid=${orderGuid}`,`${orderQuery}&%6FrderGuid=${orderGuid}`,
  `${orderQuery}&OrderGuid=${orderGuid}`,`${orderQuery}&ticketId=77`,
  `orderGuid=not-a-guid&orderBaseKey=torg2026`,
  'orderGuid=00000000-0000-0000-0000-000000000000&orderBaseKey=torg2026',
  `orderGuid=${orderGuid}&orderBaseKey=../torg2026`,
  `${orderQuery}#fragment`,`${orderQuery}#`,
 ]){
  const web=`https://app.dev.lidprod.ru/services/client_orders?${query}`;
  expect(classifyAppLink(web)).toEqual({kind:'web',url:new URL(web).href});
  expect(classifyAppLink(`leaderproduct://services/client_orders?${query}`)).toBeNull();
 }
});
