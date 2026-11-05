import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Linking, ScrollView, StyleSheet, Text } from 'react-native';
jest.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark' }) }));
import { HelpMarkdown } from '../src/features/help/components/HelpMarkdown';
import {EntityCardContext} from '../src/features/entityCards/EntityCardContext';
import {buildEntityLink,type EntityTarget} from '../src/shared/entityLinks';

const content = (view: TestRenderer.ReactTestRenderer) => {
  const collect = (node: any): string => typeof node === 'string' ? node : Array.isArray(node) ? node.map(collect).join('') : node?.children ? collect(node.children) : '';
  return collect(view.toJSON());
};
async function render(text: string) {
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => { view = TestRenderer.create(React.createElement(HelpMarkdown, { text })); });
  return view;
}

test('AI answer renders headings, nested lists, emphasis, quote and inline code as native text', async () => {
  const view = await render('# Возможности\n\n**Важно**: *проверить* ~~старое~~ `код`.\n\n3. Первый шаг\n4. Второй шаг\n   - Вложенный пункт\n\n> Проверенная инструкция');
  try {
    const text = content(view);
    expect(text).toContain('Возможности'); expect(text).toContain('3.'); expect(text).toContain('4.');
    expect(text).toContain('Вложенный пункт'); expect(text).toContain('Проверенная инструкция');
    expect(text).not.toContain('**'); expect(text).not.toContain('~~'); expect(text).not.toContain('`');
    expect(view.root.findAll(node => node.props.accessibilityRole === 'header').length).toBeGreaterThan(0);
    expect(view.root.findAllByType(Text).some(node => StyleSheet.flatten(node.props.style)?.fontWeight === '700')).toBe(true);
    expect(view.root.findAllByType(Text).some(node => StyleSheet.flatten(node.props.style)?.fontStyle === 'italic')).toBe(true);
  } finally { await act(async () => view.unmount()); }
});

test('wide tables and code scroll horizontally and preserve code characters literally', async () => {
  const view = await render('| Действие | Результат |\n| --- | --- |\n| **Проверка** | Готово |\n\n```js\nconst text = "**буквально**";\n```');
  try {
    expect(content(view)).toContain('Действие'); expect(content(view)).toContain('Проверка');
    expect(content(view)).toContain('const text = "**буквально**";');
    expect(view.root.findAllByType(ScrollView).filter(node => node.props.horizontal)).toHaveLength(2);
  } finally { await act(async () => view.unmount()); }
});

test('only supported external links open; HTML and image markup never execute or load an image', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const view = await render('[Инструкция](https://example.com/help)\n\n[опасно](javascript:alert(1)) [файл](file:///etc/passwd)\n\n<img src="https://example.com/tracker">\n\n![Схема](https://example.com/image.png)');
  try {
    const links = view.root.findAllByType(Text).filter(node => node.props.accessibilityRole === 'link');
    expect(links.length).toBeGreaterThanOrEqual(1);
    await act(async () => links[0].props.onPress());
    expect(open).toHaveBeenCalledWith('https://example.com/help');
    await act(async () => { for (const link of links) await link.props.onPress(); });
    expect(open.mock.calls.every(([url]) => /^(https?:\/\/|mailto:)/i.test(url))).toBe(true);
    expect(content(view)).toContain('<img src='); expect(content(view)).toContain('Схема');
    expect(view.root.findAll(node => typeof node.type === 'string' && /Image|WebView/.test(node.type))).toHaveLength(0);
  } finally { open.mockRestore(); await act(async () => view.unmount()); }
});

test('partial streamed answer remains readable and completes formatting in the same component', async () => {
  const view = await render('Начало **выдел');
  try {
    expect(content(view)).toContain('выдел');
    await act(async () => view.update(React.createElement(HelpMarkdown, { text: 'Начало **выделения**\n\n```txt\nнезакрытый блок' })));
    expect(content(view)).toContain('Начало выделения'); expect(content(view)).toContain('незакрытый блок');
    expect(content(view)).not.toContain('```');
  } finally { await act(async () => view.unmount()); }
});

test('confirmed internal Markdown links open the shared card panel with their label and never leave the app',async()=>{
 const target:EntityTarget={v:1,source:'onec',baseKey:'torg2026',metaType:'Catalogs',name:'Номенклатура',guid:'12345678-abcd-1234-abcd-123456789abc'};
 const openEntity=jest.fn(()=>true),openExternal=jest.spyOn(Linking,'openURL').mockResolvedValue(true);
 let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(React.createElement(EntityCardContext.Provider,{value:{isOpen:false,openEntity,openEntityLink:()=>false,close:()=>{},back:()=>{}}},React.createElement(HelpMarkdown,{text:`Товар: [**Наименование продукции**](${buildEntityLink(target)})`})))});
 try{
  const link=view.root.findAllByType(Text).find(node=>node.props.accessibilityRole==='link')!;
  expect(link.props.accessibilityHint).toBe('Открыть карточку в приложении');
  await act(async()=>link.props.onPress());
  expect(openEntity).toHaveBeenCalledWith(target,'Наименование продукции');expect(openExternal).not.toHaveBeenCalled();
 }finally{await act(async()=>view.unmount());openExternal.mockRestore();}
});

test('unknown internal versions and malformed targets stay readable without navigating',async()=>{
 const view=await render('[Сотрудник](leaderproduct://entity/v2/user/121) [Некорректный](leaderproduct://entity/v1/user/0)');
 try{expect(content(view)).toContain('Сотрудник');expect(content(view)).toContain('Некорректный');expect(view.root.findAllByType(Text).filter(node=>node.props.accessibilityRole==='link')).toHaveLength(0);}
 finally{await act(async()=>view.unmount());}
});
