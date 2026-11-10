# Сервис «Помощь»

React Native / Expo Router: `/services/help`, уведомления открывают `/services/help?ticketId=<id>`. UI работает на native и web, без WebView и без прототипного runtime. Источник визуальных решений — `DocsForAI/help-service/mobile-prototype/AGENTS.md` в основном workspace.

## Данные и действия

- `helpApi.ts` — авторизованный `/help` контракт, проверка адресов приватных вложений, загрузка файлов и источников медиа. `useHelpService.ts` — состояние сервиса, Socket.IO события/typing, REST-восстановление после переподключения и пагинация. `helpStorage.ts` — разделённые по API и аккаунту черновики текста и неизменяемые запросы для безопасного повтора.
- Номер тикета выдаёт сервер только после первого сообщения; открытие пустого чата не создаёт записи. Тема берётся из первого текста. В dev подключён настоящий OpenAI; доступность и действия ИИ определяет API.
- Список открытых/закрытых обращений: поиск на сервере, плотные строки, ответственные IT-участники (два аватара и `+N`), бирка номера, непрочитанные, typing. Порядок заморожен на время просмотра; новый порядок применяется при возвращении к списку. Дата создания не меняется от новой активности.
- Отправка текста/нескольких вложений, ответы с переходом к оригиналу (история догружается), редактирование своего сообщения до часа, пересылка в другое доступное открытое обращение, несколько неповторяющихся реакций. Право и срок повторно проверяет API. Вложения пересылаются сервером, а не повторно привязываются по старым ID.
- Автор закрывает обращение обычным composer со звёздами и необязательным комментарием/файлами. Отдельное closure-сообщение всегда показывает `0–5/5`; его можно редактировать в пределах часа, не продлевая срок повторного открытия. До 72 часов нужен новый текст причины, после — новое обращение со ссылкой на старое. Возврат из исходного тикета сохраняет связанный черновик.
- Не взятый IT-специалистом тикет из очереди сначала предлагает «Взять обращение»; нельзя отправлять сообщения до вступления. Пользователь не видит свои аватары. Чужой закрытый тикет не предлагает повторное открытие от своего имени.

## UI / медиа

- Один composer: скрепка и отправка внутри, рост до 6.5 строк, прозрачный текстовый input, затухание прокрутки сверху/снизу, мягкий фон dock. Отдельные буферы редактирования/закрытия не уничтожают обычный черновик.
- Свайп для ответа только слева направо, long-press/ПКМ открывают русское меню. Header / Android Back / web Back закрывают слои, затем чат, затем закрытый список и каталог сервисов.
- Реальная запись `expo-audio`: удержание, вверх для фиксации, влево отмена, видимый уровень микрофона и таймер. Лимит 60 секунд останавливает в черновик без автоотправки. Воспроизведение использует реальное время плеера с плавной позицией и перемоткой. На web запись требует HTTPS и разрешения микрофона.
- Галерея открывается из координат миниатюры, закрывается крестиком или движением вниз с fade/translate. Можно скачать текущий файл или все изображения; на web — последовательные downloads, на native — системное сохранение/поделиться для каждого файла. ZIP не генерируется. Приватные URLs получают токен только для своего API origin.
- Вложенные исходные тикеты имеют стек возврата. Навигационные/аккаунтные поколения защищают от поздних HTTP-ответов, стирающих другой черновик. Файлы неподтверждённого черновика сохраняются **в текущей сессии** при переходах; сохранение локальных файлов после перезапуска приложения пока не реализовано. Текст сохраняется между запусками. Уже отправленные сообщения/файлы хранятся сервером.

## Поток ИИ

`HelpAssistantRun.activityVersion=1` отображается через `HelpLiveAssistantMessage`: раскрываемый ход анализа, реальные действия знаний/1С/скриншотов, публичные пояснения модели и черновик ответа. Поведение и визуальная группировка ориентированы на мобильный work log T3 Code. Внутренние reasoning tokens и encrypted_content не отображаются; публичное пояснение явно отделено от окончательного ответа.

Снимки приходят через обычные события и sync, сохраняются существующей SQLite-историей. `eventId` защищает от отката новым снимком старого потока. Старые ответы без activityVersion остаются совместимыми. Пользовательская остановка сохраняет помеченный незавершённый черновик; новое сообщение и передача IT блокируют поздние обновления на сервере. Быстрый вариант уточнения отправляется обычным durable send с защитой от двойного нажатия. Диагностика модели и токенов не показывается в чате; метрики остаются в серверной диагностике.

Основной чат сохраняет существующий native tail motion/FlashList. Внутри раскрытого анализа действует собственный ограниченный ScrollView: новые строки следуют до ручной прокрутки. Родительские scrollToEnd по таймерам и новые native/ABI зависимости не добавлены. Текущий Metro/dev-client получает изменения как JS.

Проверены серверный реальный поток и authenticated sync, отмена, варианты уточнения и vision на синтетических данных. Пройдены компонентные/исторические тесты APP, TypeScript, Expo Doctor и изолированный web export. Нативная визуальная проверка нового блока не выполнена: Device panel не обнаружила доступный Android SDK/эмулятор.

## Проверки и границы

- `__tests__/helpUiLogic.unit.test.ts`: час/72 часа и границы, русские даты, стабильная сортировка, однонаправленный жест.
- `__tests__/helpScreen.unit.test.ts`: пустой черновик без создания, первый send, ошибка сети без потери текста, позднее чтение черновика, смена аккаунта, отправка с уходом в другой экран, сохранение выбранных файлов при Back. Сервис и native-медиа в этих тестах заменены mock-границами; это не интеграционная проверка БД/Socket.IO.
- Полная TypeScript-проверка и web export выполняются отдельно. Проверка backend, миграций, Socket.IO и dev deploy — отдельная задача владельца релиза.
- Физические Android/iOS: микрофон/перетягивание lock, системная клавиатура, скачивание/поделиться, blur, анимация галереи и доставляемость push на заблокированный телефон требуют проверки на устройстве; unit tests/web export не доказывают эти сценарии. Native push интегрирован с существующим notification pipeline, но физическая доставка ещё не подтверждена.
- Плеер отображает точную позицию воспроизведения; сервер пока не хранит массив амплитуд для аудиоволны. Уровень записи берётся из metering, когда платформа его предоставляет.

### Уточнения и вызов IT

`assistantRun.questions` содержит до трёх вопросов с `id`, `header`, `question`,
`options: [{label, description}]` и `multiSelect`. `HelpQuestionPanel` находится
внутри измеряемого HelpDock над обычным composer. У панели ограничена высота,
есть сворачивание, пропуск, радио/checkbox варианты и переходы по вопросам.
Свободный ответ вводится в прежнее поле: отдельного текстового native input нет.
Промежуточные ответы сохраняются через обычные локальные drafts с ключом,
включающим пользователя, обращение и runId. При отправке вопросы и ответы
объединяются в одно обычное durable-сообщение; до этого API не вызывается.
Старые `suggestions`, содержащие вопросы (включая обращение №24), трактуются
как открытые вопросы, а не кнопки с ответами.

`action.type=request_it` и финальная ошибка ИИ показывают под последним ответом
кнопку «Вызвать IT-специалиста» только автору открытого обращения без IT.
Кнопка открывает подтверждение; запрос `requestIt` отправляется только после
«Подтвердить вызов». Отмена ничего не передаёт; повторное подтверждение защищено
локальной блокировкой и серверной идемпотентностью. Сам ответ ИИ не выставляет
`itRequested` и не создаёт событие/уведомление `IT_REQUESTED`.

Референс поведения: T3 Code `ComposerPendingUserInputPanel.tsx` и
`PendingUserInputCard.tsx` (pingdotgg/t3code, dd5f98e). Реализация адаптирована
к существующим native motion и durable send LeaderProduct.


### Проверка ответов и файлы ИИ

Панель вопросов теперь имеет явный этап проверки, переключение шагов, radio и
multiselect, переход через 200 мс только для промежуточного одиночного выбора.
Ни выбор последнего варианта, ни стрелка composer не отправляют опрос без
явной кнопки «Отправить ответы» в обзоре. Режимы «Ответ на вопрос» и «Сообщение»
разделяют текстовые черновики; основной native input и владелец dock остаются
прежними. Выбор файлов из photo picker в режиме ответа только добавляет их
в проверяемый черновик. Фактическая отправка использует прежний durable send.

HelpAssistantFiles отображает обычные FILE attachments ответа ИИ: имя, размер,
тип, сохранение и повтор при ошибке. Доступ идёт через service.mediaSource,
с отменой позднего download/share при смене аккаунта, resolver или unmount.
Это реальные приватные вложения, не текст для ручного копирования и не
фиктивные sandbox-ссылки. Серверная генерация поддерживает TXT, MD, CSV, JSON.

### IT wait and AI return

After confirmed `request-it`, the server persists a SYSTEM row with
`itStatusChange=REQUESTED`. While the OPEN ticket has `itRequested` and no IT
member, the owner cannot send text, voice or files. The existing measured dock
shows only “Продолжить с AI”; drafts remain intact. The owner-only `continue-ai`
endpoint atomically cancels the wait before any IT joins, without replaying an
old AI prompt. A competing IT claim and return use the same ticket lock.

Joining persists `itStatusChange=JOINED`, with the actual specialist's avatar and
surname-first display name; the ordinary composer returns and AI return is no
longer available. `AI_RESUMED` records a successful return. These system lines
have no bubble background. Older tickets without events use a current-state
footer fallback, replaced when the durable event is present in the loaded page.


### IT takeover, departure and feedback (2026-11-06)

An authorized specialist can join any other user's OPEN ticket, including an
active AI conversation. Joining cancels the current AI run. The three-dot menu
exposes “Подключиться к чату” before joining and separate “Покинуть чат” /
“Закрыть чат” actions after joining. Each mutation is protected against duplicate
taps. Leaving records a minimal avatar/name system line. After the last IT leaves,
AI responds only to the next owner message; departure never replays an old prompt.

JOINED/LEFT lines use the server's immutable surname-first text. Legacy membership
fallbacks wait for authoritative `itDisplayName`, avoiding a temporary first-name
order. Mutation responses append contiguous new system rows immediately while
preserving older history windows and rejecting stale snapshots.

The per-message “Помогло” footer is removed. IT closure exposes “Оценить помощь”
to the owner through `ticket.canRate`; existing stars/comment and reopen flows are
preserved. Metadata and repaired history apply together. Feedback submitted from
the current tail pins the existing list without reloading its history; an older
history window still explicitly jumps to the latest page.


### Latest navigation preserves the loaded tail

`jumpToLatest` issues a viewport target without reading/replacing history when
the active page already has `hasNewer=false`. Message identities and prepended
rows remain intact, avoiding stale disk/server replay during the transition.
The navigation generation still invalidates an earlier outstanding jump. Missing
tail pages keep the existing cache/network path. The timeline animation and native
scroll owners are unchanged. Regression coverage: `helpServiceHistory.unit.test.ts`.


### Attachment thumbnail scheduling

Photo tiles show the plain gray `LoadingPlaceholder` until a bounded thumbnail is
ready. `helpPhotoPreviewQueue` runs at most two `Image.loadAsync` jobs, with decode
bounds capped at512px and sized for display density. Android Expo Image performs
the decode in `Dispatchers.IO`; no bitmap processing runs in JS. Only visible
indices enqueue work (initial18cells until viewability is available).

Dragging, sheet resizing and custom/native inertia pause new loads and completion
publication. Resume waits120ms after settled motion; the gesture pause is separate
from opening-layout completion. Publications yield between jobs. Offscreen/cancelled
loads cannot publish, and discarded native refs are released once. Cached mounted
previews survive motion, caption edits and selection. iOS retains its no-cloud
preview check; original-file preparation still occurs only on explicit selection.

### Файловые вложения

`HelpFileRow` задаёт общий компактный вид файлов пользователей и ИИ: круглая
иконка формата, имя и размер; время/receipt у сообщения только с файлами занимает
правую часть последней строки метаданных. Иконки различают Office/PDF/архивы/APK
и другие форматы, используя расширение и MIME. Геометрия не меняется при загрузке.

`helpAttachmentDownload` использует авторизованный resolver и реальные байты
Native DownloadResumable / web stream. Кольцо и подпись показывают получено/всего;
неизвестный размер остаётся indeterminate, без выдуманного процента. Публикация
прогресса ограничена10Hz плюс завершение. Отмена/смена аккаунта/рециклинг ячейки
прерывают операцию и блокируют поздний share/progress; очищается только уникальный
временный файл этой операции. Завершение освобождает подписку SDK58, файл сохраняется.

### Connection recovery after backgrounding

`createManagedSocketConnection` owns transport replacement and retries. It pauses
in background, replaces the transport on foreground, uses one bounded token read
and handshake at a time, and fences old attempts with generation + AbortSignal.
Socket.IO's separate reconnect loop is disabled. Retries back off from1.2s to30s;
manual recovery is coalesced. Help retains its account/JWT fences and periodic
rotation checks; an unchanged token does not prevent recovery.

`helpAccountSync` reports connected only after a `help:subscribe` ACK (5s deadline).
The15s foreground heartbeat also verifies the subscription, so a half-open socket
cannot appear healthy indefinitely. Old socket callbacks cannot revive readiness;
recovery uses the same durable event cursor and existing idempotent outbox.
The header changes from “Соединение…” to “Нет связи / Повторить” after12s.
Credential reads have bounded waits; refresh is single-flight before its first
await. Consumer deadlines never start overlapping noncancelable token writes.
