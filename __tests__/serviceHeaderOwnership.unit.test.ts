import { serviceOwnsHeader } from '../src/features/navigation/serviceHeaderOwnership';

test.each(['help','help/index','help/knowledge','stock_balances/index'])('%s owns its header from the initial route descriptor',name=>{
  expect(serviceOwnsHeader(name)).toBe(true);
});
test.each(['index','appeals/index','helpdesk/index','client_orders/index'])('%s retains the shared app header',name=>{
  expect(serviceOwnsHeader(name)).toBe(false);
});
