import {helpMarkdownBlocks} from '../src/features/help/helpMarkdownModel';
test('only top-level Markdown blocks split: lists, fenced code and tables stay intact',()=>{
 const parts=['# Заголовок\n\n','Первый абзац.\n\n','1. Пункт\n\n   Второй абзац пункта.\n2. Другой пункт\n\n','```md\nАбзац\n\nЕщё текст\n```\n\n','| A | B |\n|---|---|\n| 1 | 2 |\n'];
 const text=parts.join(''),blocks=helpMarkdownBlocks(text);expect(blocks.map(b=>b.text)).toEqual(parts);expect(blocks.map(b=>text.slice(b.start,b.start+b.text.length))).toEqual(parts);
});
test('completed paragraphs keep their identity/content when a later block grows',()=>{
 const a=helpMarkdownBlocks('Первый абзац.\n\nНачало'),b=helpMarkdownBlocks('Первый абзац.\n\nНачало продолжения');expect(a[0]).toEqual(b[0]);expect(b.at(-1)?.text).toBe('Начало продолжения');
});
test('reference definitions keep one parsing context and large answers bound component count',()=>{
 const ref='[Источник][doc]\n\nДругой абзац\n\n[doc]: https://example.test';expect(helpMarkdownBlocks(ref)).toEqual([{start:0,text:ref}]);
 const text='Абзац\n\n'.repeat(300);const blocks=helpMarkdownBlocks(text);expect(blocks).toHaveLength(64);expect(blocks.map(b=>b.text).join('')).toBe(text);expect(helpMarkdownBlocks('')).toEqual([]);
});
