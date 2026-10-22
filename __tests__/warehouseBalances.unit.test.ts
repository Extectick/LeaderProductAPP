import {selectedWarehouseRows,warehouseBalanceRows} from '../src/features/stockBalances/warehouseBalances';
const a={guid:'a',name:'Основной'},b={guid:'b',name:'Переработка'},c={guid:'c',name:'Другой склад'};
const groups=[{key:'omsk',name:'Омск',items:[a,b]},{key:'nsk',name:'Новосибирск',items:[c]}];
const balances=[a,b,c].map(w=>({id:w.guid,warehouse:w,inStock:10,reserved:1,available:9}));
it('uses only selected warehouses, matching GUIDs without case differences',()=>{
  expect(selectedWarehouseRows(balances,[{...a,guid:'A'}])).toEqual([balances[0]]);
  expect(selectedWarehouseRows(balances,[])).toEqual(balances);
});
it('shows a checked folder with its warehouses and leaves individually selected warehouses flat',()=>{
  const rows=warehouseBalanceRows(balances,[a,b],groups,new Set());
  expect(rows.map(r=>r.id)).toEqual(['omsk','a','b']);
  expect(rows[0]).toMatchObject({kind:'folder',expanded:true,count:2});
  expect(rows[1]).toMatchObject({kind:'balance',indented:true});
  expect(warehouseBalanceRows(balances,[a],groups,new Set())).toEqual([{kind:'balance',id:'a',item:balances[0],indented:false}]);
});
it('collapses folders without leaking warehouses or duplicating headers when pages merge',()=>{
  expect(warehouseBalanceRows(balances,[a,b],groups,new Set(['omsk']))).toEqual([{kind:'folder',id:'omsk',name:'Омск',count:2,expanded:false}]);
  expect(warehouseBalanceRows(balances,[a,b,c],groups,new Set()).filter(r=>r.kind==='folder')).toHaveLength(2);
  expect(warehouseBalanceRows(balances,[],groups,new Set()).every(r=>r.kind==='balance'&&!r.indented)).toBe(true);
});
