import {buildEntityLink,normalizeEntityTarget,parseEntityLink,type EntityTarget} from '../src/shared/entityLinks';
import {redirectEntitySystemPath,takeEntityLinkIntent} from '../src/shared/entityLinkIntent';
const guid='12345678-abcd-1234-abcd-123456789abc';
const target:EntityTarget={v:1,source:'onec',baseKey:'torg2026',metaType:'Catalogs',name:'Номенклатура',guid};
test('versioned links round-trip Russian metadata and retain the exact 1C base',()=>{
 expect(parseEntityLink(buildEntityLink(target))).toEqual(target);
 const other={...target,baseKey:'wms15'};
 expect(buildEntityLink(target)).not.toBe(buildEntityLink(other));
 expect(parseEntityLink(buildEntityLink(other))).toEqual(other);
 expect(parseEntityLink('leaderproduct://entity/v1/user/121')).toEqual({v:1,source:'app',kind:'user',id:'121'});
});
test.each(['leaderproduct://entity/v2/user/1','leaderproduct://entity/v1/user/01','leaderproduct://entity/v1/user/2147483648','leaderproduct://entity/v1/user/1?token=abc','leaderproduct://entity/v1/user/1#hash','leaderproduct://person:pass@entity/v1/user/1','https://entity/v1/user/1','leaderproduct://entity/v1/onec/torg2026/Catalogs/%ZZ/'+guid,'leaderproduct://entity/v1/onec/torg2026/Catalogs/%2F'+guid+'/'+guid,'leaderproduct://entity/v1/user/1\\other','leaderproduct://entity/v1/user/1\n'])('untrusted or unsupported link does not navigate: %s',url=>{expect(parseEntityLink(url)).toBeNull();});
test('object contracts never coerce app IDs into 1C identity or accept extra commands',()=>{
 expect(normalizeEntityTarget({...target,execute:'write'})).toBeNull();
 expect(normalizeEntityTarget({...target,guid:'00000000-0000-0000-0000-000000000000'})).toBeNull();
 expect(normalizeEntityTarget({v:1,source:'app',kind:'user',id:121})).toBeNull();
});
test('native intents only rewrite confirmed entity URI syntax and preserve other app links',()=>{
 expect(redirectEntitySystemPath(buildEntityLink(target))).toBe('/entity-link');
 expect(takeEntityLinkIntent()).toBe(buildEntityLink(target));expect(takeEntityLinkIntent()).toBeNull();
 const development='leaderproduct-dev://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081';
 expect(redirectEntitySystemPath(development)).toBe(development);expect(takeEntityLinkIntent()).toBeNull();
 expect(redirectEntitySystemPath('/home')).toBe('/home');
});

test('application product uses its own explicit GUID namespace',()=>{
 const target={v:1 as const,source:'app' as const,kind:'product' as const,guid:'aaaa1111-bbbb-4111-8111-ccccdddd0001'};
 expect(buildEntityLink(target)).toBe('leaderproduct://entity/v1/product/'+target.guid);
 expect(parseEntityLink(buildEntityLink(target))).toEqual(target);
 expect(normalizeEntityTarget({...target,id:'121'})).toBeNull();
});
