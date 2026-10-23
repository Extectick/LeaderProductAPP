import fs from 'node:fs';
import path from 'node:path';
import { SERVICE_CATALOG } from '../src/features/services/config/serviceCatalog';
import { canOpenService, INSTALLED_SERVICE_ROUTES, supportsServiceRoute } from '../src/features/services/lib/serviceAvailability';

const help = SERVICE_CATALOG.find(item => item.key === 'help')!;
test('Help is a real installed route, not just a server catalog entry', () => {
  expect(help.route).toBe('/services/help');
  expect(canOpenService(help, true, 'android')).toBe(true);
  expect(fs.readFileSync(path.join(__dirname, '../app/(main)/services/help/index.tsx'), 'utf8')).toContain('HelpScreen');
});
test.each(Object.entries(INSTALLED_SERVICE_ROUTES))('%s has a bundled screen', (_, route) => {
  expect(fs.existsSync(path.join(__dirname, '../app/(main)', route, 'index.tsx'))).toBe(true);
});
test('future server entries never navigate to missing screens, even online or LOCAL', () => {
  expect(canOpenService({...help, key:'future', route:'/services/future', kind:'LOCAL'}, true, 'android')).toBe(false);
  expect(canOpenService({...help, route:'/services/unknown'}, true, 'web')).toBe(false);
});
test('recognizes route group and query while rejecting external/mismatched destinations', () => {
  expect(supportsServiceRoute({...help, route:'/(main)/services/help/?ticketId=1'})).toBe(true);
  for(const route of ['https://example.com/services/help','//example.com/services/help','/admin','/services/help/missing']) {
    expect(supportsServiceRoute({...help, route})).toBe(false);
  }
});
test('route support never overrides server permissions or offline policy', () => {
  expect(canOpenService({...help, enabled:false},true,'android')).toBe(false);
  expect(canOpenService({...help, visible:false},true,'android')).toBe(false);
  expect(canOpenService(help,false,'android')).toBe(false);
});
