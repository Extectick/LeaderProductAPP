import {helpMessagePreview} from '../src/features/help/helpMessagePreview';

test.each([
 ['## Готово\n\n**Отчёт** за _ноябрь_.','Готово Отчёт за ноябрь.'],
 ['> **Важно**\n\n- Первый\n- Второй','Важно Первый Второй'],
 ['[Инструкция](https://example.test/path) и ![Схема](image.png)','Инструкция и Схема'],
 ['`file_name.txt` и **C#**: 2 * 3 = 6','file_name.txt и C#: 2 * 3 = 6'],
 ['```js\nconst x = 2;\n```','const x = 2;'],
 ['~~Удалено~~, осталось','Удалено, осталось'],
 ['Текст\nна двух строках','Текст на двух строках'],
 ['| Имя | Итог |\n| --- | --- |\n| Тест | Да |','Имя Итог Тест Да'],
 ['',''],
])('preview preserves readable content of %j',(source,expected)=>{
 expect(helpMessagePreview(source)).toBe(expected);
});
