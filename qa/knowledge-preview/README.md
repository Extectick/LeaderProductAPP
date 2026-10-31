# Локальная проверка интерфейса базы знаний

Из корня APP выполните `npm run qa:knowledge` на установленном Node 24. Откроется `http://localhost:8102`.

Это реальные компоненты `src/features/knowledge` с внедрённым клиентом данных примера. Стенд не запрашивает авторизацию, не отправляет файлы и не меняет dev или production. Рабочий интерфейс находится в приложении: «Администрирование → База знаний» либо меню «Помощи» для проверяющего.

Верхние переключатели воспроизводят обычную работу, конфликт версии при публикации, ошибку источника и отсутствие права доступа. Выбор нескольких отделов и сотрудников, отзыв, переходы между версиями и повтор обработки работают в памяти; перезагрузка сбрасывает пример.

Для проверки в браузере через Playwright CLI:

```powershell
npx --yes --package @playwright/cli playwright-cli -s=knowledge open http://localhost:8102 --headed
npx --yes --package @playwright/cli playwright-cli -s=knowledge run-code --filename=qa/knowledge-preview/check-flow.js
```

Сценарий проверяет только новый интерфейс. Скриншоты сохраняются в `output/playwright`; каталог локальный, в Git не добавляется. Для целевых unit-проверок: `npm run test:unit -- --runInBand __tests__/knowledgeReview.unit.test.ts`.
