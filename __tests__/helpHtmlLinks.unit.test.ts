import {helpHtmlLocalAnchors,helpHtmlWebLinks} from '../src/features/help/helpHtmlLinks';
test('only safe absolute web links become app-owned controls and HTML entities are decoded',()=>{
 const html='<a href="https://tass.ru/?a=1&amp;b=2"><b>Новости</b></a><a href="javascript:alert(1)">Bad</a><a href="https://user:secret@site.test/">Secret</a><a href="#local">Local</a>';
 expect(helpHtmlWebLinks(html)).toEqual([{url:'https://tass.ru/?a=1&b=2',label:'Новости'}]);
});
test('web srcDoc keeps local fragments but cannot navigate to a remote/unsafe duplicate href',()=>{
 const html='<a href="https://tass.ru/">Сайт</a><a href="#local">Local</a><a href="https://tass.ru/" href="https://other.test/">Duplicate</a>';
 const local=helpHtmlLocalAnchors(html);expect(local).toContain('href="#local"');expect(local).not.toMatch(/\shref="https:/);expect(local).toContain('data-help-viewer-href="https://other.test/"');
});
test('malformed anchors are inert without changing ordinary displayed source text',()=>{
 expect(helpHtmlLocalAnchors('<code>href=x</code><a href="https://site.test/')).toBe('<code>href=x</code><a data-help-viewer-href="https://site.test/');
 expect(helpHtmlLocalAnchors('<a href="https://site.test/?q=>">Link</a>')).not.toMatch(/\shref=/);
});
test('a later declared link is not silently disabled by a presentation count cap',()=>{
 const html=Array.from({length:21},(_,i)=>`<a href="https://news.test/article/${i}">Статья ${i}</a>`).join('');expect(helpHtmlWebLinks(html)).toHaveLength(21);
});
