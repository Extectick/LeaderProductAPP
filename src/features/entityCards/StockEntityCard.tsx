import React from 'react';
import {StockProductDetails,type StockProductDetailsProps} from '../stockBalances/StockProductDetails';
import {useWarehouseSelection} from '../stockBalances/useWarehouseSelection';

/** Uses the very same stock-service body and per-account warehouse preference. */
export function StockEntityCard({product,userId,...props}:Omit<StockProductDetailsProps,'warehouses'|'userId'>&{userId:number}){
 const account=String(userId),warehouses=useWarehouseSelection(account);
 return <StockProductDetails {...props} product={product} userId={account} warehouses={warehouses}/>;
}
