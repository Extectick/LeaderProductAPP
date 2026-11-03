// The design APK has no authority to change actual users, access rules or releases.
// Keep Metro/font/assets available while rejecting any accidental live API call.
const fixtureGlobal = globalThis as typeof globalThis & {__adminFixtureFetchInstalled?:boolean};
if(!fixtureGlobal.__adminFixtureFetchInstalled){
  const original=globalThis.fetch.bind(globalThis);
  globalThis.fetch=((input:any,init:any)=>{
    const uri=typeof input==='string'?input:input?.url;
    if(typeof uri==='string'&&/^https?:/i.test(uri)){
      const target=new URL(uri);
      if(target.port!=='8110')return Promise.reject(new Error('Дизайн-стенд работает с локальными тестовыми данными. Запрос к серверу отключён.'));
    }
    return original(input,init);
  }) as typeof fetch;
  fixtureGlobal.__adminFixtureFetchInstalled=true;
}
