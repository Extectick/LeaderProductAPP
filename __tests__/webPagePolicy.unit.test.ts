import {normalizeWebUrl,webPageActionUrl,webPageDomain} from '../src/features/webPages/webPagePolicy';
test('normalizes ordinary sites and keeps their query/fragment identity',()=>{
 expect(normalizeWebUrl('https://TASS.ru/news?q=1#article')).toBe('https://tass.ru/news?q=1#article');
 expect(normalizeWebUrl('http://example.test')).toBe('http://example.test/');
 expect(webPageDomain('https://tass.ru/')).toBe('tass.ru');
});
test.each(['javascript:alert(1)','data:text/html,x','file:///etc/passwd','https://user:pass@tass.ru/','https://tass.ru\\@evil.test','https://tass.ru/\nnews','https://tass.ru/ news','/relative','//tass.ru','https://',''])('rejects unsafe or ambiguous browser addresses: %j',value=>{
 expect(normalizeWebUrl(value)).toBeNull();
});
test('non-browser actions are separate from browser addresses',()=>{
 expect(webPageActionUrl('leaderproduct://entity/v1/user/1')).toBe('leaderproduct://entity/v1/user/1');
 expect(webPageActionUrl('mailto:help@example.test')).toBe('mailto:help@example.test');
 expect(webPageActionUrl('tel:+79990000000')).toBe('tel:+79990000000');
 expect(webPageActionUrl('https://tass.ru/')).toBeNull();
 expect(webPageActionUrl('intent://arbitrary')).toBeNull();
 expect(webPageActionUrl('leaderproduct://user:secret@entity/foo')).toBeNull();
});
