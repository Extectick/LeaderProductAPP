export async function getClientOrderInvoices(){return {items:[]};}
export async function requestClientOrderInvoice(){return {invoiceRequested:true,invoiceState:'WAITING'};}
export async function downloadClientOrderInvoice(){throw new Error('QA: PDF download has no live API');}
export async function getClientOrderReferenceDetails(kind:string,guid:string){return {kind,guid,title:'Демонстрационный реквизит',sections:[{title:'Данные стенда',rows:[{label:'Источник',value:'Локальные тестовые данные'}]}],debug:{fixture:true}};}
