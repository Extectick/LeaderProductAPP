# Help: один владелец движения чата

## Границы ответственности

| Слой | Ответственность |
| --- | --- |
| `HelpScreen` / сервис | Сообщения, outbox, выбор чата, намерение читать конец или историю |
| FlashList | Виртуализация, измерение ячеек, пагинация, сохранение якорей |
| `LeaderHelpChatLayout`, ABI `tailMotionVersion >= 3` | IME, положение нижнего поля, диапазон прокрутки, закрепление конца и компенсация фактического движения перед отрисовкой |
| `HelpTimeline` на старых APK и Web | Совместимый JS-путь; не включается одновременно с нативным владельцем |
| Переходы между фрагментами истории | Отдельный режим навигации, временно отключающий автоматическое следование за концом |

## Почему прежний вариант дёргался

JS-компенсация и нативное закрепление срабатывали в разных кадрах. FlashList мог сначала отдать предварительные размеры, а затем изменить их после измерения медиа. На короткой ленте высота контейнера вообще остаётся равной высоте окна, хотя ячейки и offset меняются. Реальный сценарий с открытой IME показал offset около 201dp при правильном конце около 413dp: проверка только изменения высоты этот случай пропускала.

Нативный владелец сопоставляет логические ячейки по стабильным `nativeID`, сохраняет фактические координаты и применяет закрепление с обратным смещением до кадра. Подтверждение optimistic-сообщения сохраняет его идентичность. Начало настоящего жеста прокрутки освобождает следование нативно, до движения списка. Поздняя запись offset со стороны FlashList не считается жестом пользователя.

## Настройка через OTA

`HELP_TAIL_MOTION` в `src/features/help/helpTailMotion.ts` — версия политики 1:

- `enabled` — отключение визуальной анимации без отключения правильной геометрии;
- `durationMs` — скорость;
- `curve` — `spring`, `cubic` или `quint`;
- `maxViewport` — предел смещения относительно окна;
- `entryDistanceDp` — появление первого сообщения.

Новые свойства передаются только после проверки ABI. Старые APK их не получают. При изменении значений политики достаточно OTA; изменение нативного алгоритма или расширение ABI требует APK.

Не добавлять параллельную JS-анимацию подъёма, повторные `scrollToEnd` по таймерам или отдельное смещение для фото/голоса/ответов ИИ. В режиме ABI 3 весь стек движется одним механизмом. IME также имеет одного владельца, без дублирования её отступа в Yoga.

Пустой новый чат с `emptyHintMotionVersion >= 1` также принадлежит этому нативному
владельцу: блок «Чем помочь?» сохраняет исходные Yoga-границы и центрируется между
шапкой и фактической верхней границей dock в каждом кадре IME. Раньше его нижняя
граница менялась через JS только после итогового `onImeInsetChange`, поэтому блок
перескакивал в конце анимации клавиатуры. Новый `emptyHintId` передаётся только
при наличии ABI; старые APK сохраняют совместимый путь. При потере фокуса,
исчезновении пустого состояния или размонтировании нативный transform освобождается.
Это расширение нативного ABI требует нового APK; одна OTA его не устанавливает.

## Узкая проверка

1. Новый чат, открытая IME, первое сообщение: нижняя граница ответа остаётся выше поля ввода без ручной прокрутки.
2. Следующие сообщения, фото и растущий ответ ИИ: реальные смещения компенсируются одним нативным владельцем.
3. Начало ручного чтения выше: входящие сообщения не возвращают пользователя вниз.
4. Просмотр фото не восстанавливает фокус поля после закрытия.
5. В пустом новом чате открыть и закрыть IME: блок «Чем помочь?» движется в тех
   же кадрах, что dock, без дополнительного скачка на итоговом inset. Повторить
   после ухода из Help и возврата; проверить изменение высоты поля ввода.

Диагностика: `native.chat.frames` (`end`, `offset`, `gap`, `tailDelta`, `presentationOffset`, `tailAnchors`) и `native.timeline.tailMotionOwner`. Использовать ограниченный сценарий и `--probes chat,timeline`, не запускать старые проверки остальных сервисов.

Принципы сопоставлены с официальными исходниками Telegram Android: [ChatListItemAnimator](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/ui/recyclerview/ChatListItemAnimator.java), [AdjustPanLayoutHelper](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/ui/ActionBar/AdjustPanLayoutHelper.java). Реализация для React Native написана отдельно.

## Компактные вопросы ИИ

Панель остаётся внутри единственного измеряемого `HelpDock`, в общей поверхности
`HelpComposer`, над тем же native input. Одновременно виден один вопрос:
счётчик справа, простые radio/checkbox без рамок и номеров. Собственный ответ
вводится в обычное поле. Выбор пункта сохраняет уже набранный текст.
Переход выполняется единственной стрелкой composer, без таймерного auto-next.
Под вариантами находятся маленькие «Назад» (со второго шага) и «Пропустить»
с полноценными touch targets. Навигация стоит выше input, чтобы его нижняя
граница не прыгала при раскрытии. Сворачивание возвращает обычное сообщение,
сохраняя раздельные черновики. Восстановленная свёрнутая панель тоже включает
режим сообщения. Последняя стрелка сразу отправляет собранные ответы; отдельного
подтверждения нет. Submit checkpoint, привязка файлов и защита от двойной отправки
сохраняются. Старый review-черновик открывается на последнем вопросе без отправки.
Выбор файла в picker только подготавливает его; отправляет стрелка composer.
В чате вопрос заменяется статусом «ИИ ожидает ответ», после ответа — «Ответы
получены». Исходный текст сообщений и серверные данные сохраняются.

«Пропустить» относится только к текущему вопросу: остальные ответы сохраняются,
а последний пропуск отправляет собранные ответы с явной отметкой о пропущенном.
Незаполненный вопрос без явного пропуска блокирует отправку. Старые локальные
`dismissed`-черновики восстанавливаются с сохранением ответов и пропуском только
активного вопроса, без автоматической отправки при восстановлении.

`HelpQuestionReveal` анимирует реальную высоту области вопросов ВНУТРИ окрашенной
поверхности composer. Раскрытая и свёрнутая ветви остаются смонтированными;
неактивная ветвь не принимает касания и скрыта от accessibility. Измеренные размеры
кэшируются, поэтому обе стороны перехода доступны до первого кадра. Высота и
прозрачность используют один UI-thread clock:220ms cubic-out, прерывание начинает
новый переход из текущей высоты, reduced motion применяет размер сразу.

Прежний внешний размерный easing `HelpDock` удалён: прозрачный viewport менял
размер после мгновенного удаления содержимого/фона и повторно сглаживал покадровые
изменения многострочного input. Теперь input остаётся постоянным sibling области
вопросов, его высота проходит непосредственно к существующему владельцу геометрии.
`HelpComposer` не запускает React-render на каждом кадре размера панели; актуальный
размер хранится для позиционирования записи/заморозки photo picker.

`LeaderHelpChatLayout` считывает фактический край dock в каждом pre-draw,
синхронно меняет доступный диапазон и удерживает конец чата над полем. Начатое
чтение истории сохраняет прежнюю политику освобождения follow. Дополнительный
APK для этого JS изменения не нужен; геометрия использует существующий ABI.

Заполненный вопрос скрывает «Пропустить», а пустой показывает её правее центра,
со смещением56dp от оси стрелки. Высота навигации44dp сохраняется. Запоздавший
обработчик Skip сохраняет уже заполненный ответ. Восстановление черновика
защищено поколением эффекта и ревизией от поздних чтений StrictMode/Fast Refresh.
Статус ожидания в чате располагается в одной строке справа от иконки ИИ.
Метки поиска используют существующее публичное число найденных источников.

Высота списка вопросов рассчитывается через `helpQuestionBodyHeight`: после
реального IME overlap и header резервируются input, навигация и строка чата.
Жёсткое ограничение55% удалено. Размер input поступает через существующий
`onResize`, пустой сброс возвращает48dp. При нехватке места тело прокручивается;
стрелка вниз исчезает после достижения последнего варианта. Заголовок сохраняет
размер текста, но использует2dp вертикального отступа и8dp сверху панели.

Навигация вопросов теперь находится сверху над телом вопроса/вариантами:
«Назад» слева со второго шага, «Пропустить» у правого края. Строка44dp
сохраняется при скрытии Skip у заполненного ответа. `HelpQuestionTransition`
двигает только входящее тело вопроса: следующий справа, предыдущий слева,200ms.
Первое восстановление без сдвига, reduced motion без анимации. Input остаётся
за пределами перехода; геометрия/IME/прокрутка чата получают прежнего владельца.

## Даты в прокручиваемом содержимом и закрепление

`HelpInlineDate` остаётся в настоящей строке FlashList: прокрутка, native IME,
tail-компенсация и сохранённый фрагмент перехода двигают её вместе с сообщениями.
Прозрачные строки с движущимися копиями во внешнем слое больше не используются.
`HelpTimelineDates` над blur содержит только закреплённые копии. При достижении
`headerHeight - 12` оригинал скрывается, копия появляется в той же позиции;
следующая дата вытесняет её на высоту плашки. При обратной прокрутке оригинал
снова видим. Геометрия включает margin короткой истории и актуальные измерения.

На Android/iOS исходный `Animated.ScrollView` связывает offset с видимостью и
вытеснением через native driver. Движение самой строки не вычисляется через JS.
Web вообще не связывает `Animated.event` с датами: именованный CSS scroll timeline
берёт offset непосредственно у scroll-контейнера. `HelpDateScrollScope` ограничивает
его ближайшим общим предком списка и слоя, затем восстанавливает CSS при выходе.
При отсутствии поддержки scroll timelines даты остаются только в потоке;
JS не имитирует движение строк и не создаёт перекрывающую их закреплённую копию. Для короткого списка
без диапазона прокрутки неактивный timeline не показывает лишнюю закреплённую копию.

Ни таймеров догоняющего движения, ни дополнительного scrollTo, ни нового владельца
IME/tail нет. Навигация по нажатию и нативный ABI сохранены. Проверка web включает
прокрутку с временно заблокированными JS scroll events: геометрия дат должна
оставаться синхронной с сообщениями. Автотесты Android не заменяют Device QA.

## Клавиатура нового чата и пустая подсказка

Новый чат соблюдает строгий порядок: существующая клавиатура поиска закрывается,
затем полностью завершается вход страницы, затем `HelpChatEntry.onEntered`
создаёт единственный запрос focus. До этого composer не активен и focusKey=0.
Отложенный focus выполняется в следующем RAF и отменяется при уходе; завершение
уже размонтированного перехода не открывает IME. Предварительного открытия
клавиатуры в скрытой форме, ожидания keyboardDidShow и таймера600ms больше нет.
Открытие существующей истории/local-first и фоновые сетевые проверки сохранены.
Обращение по-прежнему создаётся только при обычной отправке.

Composer считает запрос focus исполненным только внутри реально дошедшего RAF,
а не при постановке задачи. Повторный setup эффекта StrictMode/Fast Refresh
может отменить первый RAF; повторный setup сохраняет неисполненное намерение.
Открытие photo viewer по-прежнему явно поглощает pending request и не
восстанавливает клавиатуру после закрытия. Регрессия воспроизводилась в
StrictMode: старый код давал0вызовов focus, исправленный даёт ровно1.

Yoga-границы «Чем помочь?» остаются между шапкой и resting dock. При
`emptyHintMotionVersion >= 1` нативный владелец IME в том же callback/pre-draw
перемещает dock и центрирует подсказку по его фактическому верхнему краю.
Подсказка сдвигается на половину перемещения dock без отдельного spring/timing,
JS-кадров или изменения Yoga-высоты в конце клавиатурной анимации.

Совместимый путь старых APK сглаживает только итоговый inset через native-driver
spring и не обеспечивает точного совпадения с IME-кадрами. Проверенный старый
arm64 DEV APK не содержит `emptyHintMotionVersion`: для синхронного поведения
нужен совместимый обновлённый DEV APK с существующим нативным владельцем.
Это отдельный пакет com.leaderproduct.app.dev; Metro/OTA сами не добавляют ABI.

## Высота многострочного поля и верхнее затухание

Строка composer сохраняет только минимум 48 dp. Две строки текста занимают около 68 dp,
три — 90 dp при стандартном размере шрифта; прежний минимум 88 dp для любого
многострочного текста удалён. Высоту анимирует сам input, без второго размерного
эффекта вокруг него. Кнопка разворота появляется с третьей визуальной строки,
когда её область нажатия 44 dp помещается над отправкой. В бюджет вопросов передаётся
реальная внешняя высота native input, с минимумом 48 dp.

`LeaderHelpInputView` применяет затухание на 12 dp только к тексту, который продолжается
выше видимой границы. Учитываются реальный EditText scroll и обрезка во время
анимации роста; при возврате к началу первая строка снова полностью видна.
Маска не окрашивает фон и не закрывает scrollbar/кнопки. Совместимый RN/Web путь
использует градиент поверх текста с силой, пропорциональной scroll offset.
Android fade требует пересборки APK; компактная высота доступна через Metro/OTA.

`composerMotionVersion >= 3` сохраняет внутреннюю высоту EditText на 145 dp,
а его начало — на 12 dp от верхнего края поля. При добавлении строки текст
поднимается вместе с растущим полем, а не перескакивает сразу по новой высоте
всего текста. На предельной высоте тот же ValueAnimator плавно меняет scrollY;
системный `bringPointIntoView` отключён, чтобы EditText не обгонял этот переход.
Повторный ввод продолжает движение от текущего положения. Касание отдаёт
прокрутку пальцу, reduced motion применяет конечное положение сразу.

Прозрачная маска DST_OUT затухает на 16 dp сверху и снизу только при наличии
скрытого текста с соответствующей стороны; при нулевом scroll первая строка
не затемняется. Маска применяется только к области текста, до scrollbar и кнопок.
Новая строка раскрывается вместе с доступной областью во время роста. DEV
диагностика содержит фактические editorTop/scrollY, цель прокрутки и обе маски.
Это нативное исправление требует нового APK; OTA 0.1.46.20 не обновляет EditText.

### История во время входа и placeholders вложений

Локальная история монтируется в первом commit сцены. Промежуточный
`historyMounted=false` и синхронное повторное монтирование из layout-эффекта
удалены: они задерживали первый кадр, хотя native timing уже был запущен.
`HelpTimeline` проверяет измеренное окно прямо в FlashList `onCommitLayoutEffect`,
после применения `initialScrollIndex`, не ожидая позднего `onLoad`/дополнительного RAF.
Неизмеренный или неверно расположенный сохранённый якорь всё ещё скрыт; завершение
240ms анимации не служит условием показа сообщений. Дальний overscan остаётся
отложенным до завершения входа.

Фото сохраняют заданные размеры и серый placeholder до реального `onLoad`
текущей ячейки, включая локальные и кэшированные источники. Наличие URL в кэше
не означает, что нативное изображение уже декодировано. Отложенные изображения
показывают серую область без дополнительных запросов. Карточки файлов сохраняют
геометрию и показывают серое состояние загрузки с индикатором, ошибкой/повтором;
повторные нажатия во время одной операции не запускают новые скачивания.

Регрессии проверяют показ измеренного окна до `onLoad`/окончания входа и скрытие
неизмеренного якоря. Unit-тесты и сборка не подтверждают визуальную плавность
на физическом устройстве.

При начальном позиционировании ScrollView ref нормализует команды FlashList
в одну конечную позицию. Его queued initial-index replay не должен возвращать
видимый список к верху последней ячейки после `scrollToEnd`. Для измеренного
anchor используется один offset; для полного короткого чата/latest — native end.
Неизмеренные подготовительные команды проходят, API измерения/ref сохраняются.
Владение прекращается при жесте или новом navigation key, а не по времени
окончания входа (reduced motion может завершиться раньше replay). JS/native
tail presentation не анимирует исходную геометрию входа; range pin/padding
остаются активными. В существующем чате composer resize не включает follow
до решения timeline о начальной позиции. Live blur исходного списка отключается
с началом входа. Нативные input/fade правки этой задачей не меняются.

### Быстрая прокрутка галереи вложений

Сетка фотографий сохраняет ограниченное окно FlatList. `removeClippedSubviews=false`
нужен для трансформируемой панели/камеры и сам по себе не отменяет виртуализацию.
Для строк из трёх одинаковых плиток задан `getItemLayout` с реальной высотой/gap
и header offset. Подгрузка начинается за четыре viewport до конца и повторно
проверяется при росте content size; запросы защищены in-flight флагом. Объединение
страниц использует Set ID вместо вложенного перебора всей истории.

UI-thread decay имеет ограниченный запас хода за прежний край страницы, а
реальный gridTarget всегда ограничен текущим gridMaximum. При поступлении новой
страницы инерция может продолжиться, вместо завершения на устаревшем clamp.
Это не обещает бесконечного скролла при недоступной/медленной медиатеке: требуется
запас метаданных; оригиналы выбранных фото всё ещё готовятся только по выбору.

### Заголовок сообщений ИИ

Legacy и activity v1 используют общий `HelpAssistantHeading`: иконка30dp
на круглой поверхности42dp и постоянное имя «ИИ ассистент». До финального
ответа HelpAssistantProgress показывает публичные этапы с галочками, текущий
индикатор и доступный текст анализа. Журнал ограничен260dp и следует за
обновлениями до ручной прокрутки. После завершения/остановки он скрыт,
кнопки раскрытия исторического журнала нет. Legacy использует свой контракт шагов.
Контракт API не меняется; поток ответа, вопросы, файлы, повтор, подключение1С
и подтверждаемая передача IT сохраняются.


### Complete short histories at the scroll edge

For a fully downloaded history whose measured rows/header fit the viewport,
FlashList native anchoring remains disabled throughout manual scrolling, including
both edges. Turning off tail following must not temporarily mount ScrollAnchor
and remove it again at offset zero. There is no offscreen row to preserve in this
complete short list. Bottom alignment remains a layout property; windows with
older/newer pages and long histories keep the existing anchor policy.

Regressions cover the first drag, settling at the start, scrolling away again,
and short partial windows that still need older/newer-page anchoring. This is a
JS-only change compatible with the existing APK. QA2 post-fix visual confirmation
was unavailable after Device Support/ADB timeouts; unit tests do not substitute
for the physical-device scrolling check.


### Android short-list drag interception at zero

The MVP change in OTA0.1.46.26 did not fix the reported issue. Device MCP
reproduced it again with one/two fixture messages. Touch events reached the list,
but no BEGIN_DRAG/scroll followed at offset0 although the actual native range
remained124dp. Android15 ScrollView.onInterceptTouchEvent returns early when
scrollY==0 and canScrollVertically(1)==false. Its extent comparison can see a
viewport-sized child as non-scrollable despite our native bottom padding.
Source: https://github.com/aosp-mirror/platform_frameworks_base/blob/android-15.0.0_r1/core/java/android/widget/ScrollView.java

NativeScroll now sets an Android/native-dock-only minimum content height of
ceil(viewportHeight)+1dp. This keeps the platform interception range positive
at zero. Only viewport onLayout updates this local leaf; native IME ownership,
bottom alignment, long content, pagination and scroll refs remain intact.
Regression checks cover viewport resize/fractional size and unaffected iOS/Web/
legacy paths. Device evidence: content800→801, top0→bottom125 after the return
gesture, repeated one-message0↔125 cycles. See private help-short-scroll-r2/.
Software IME was not displayed by this emulator (hardware keyboard active), so
these checks do not claim keyboard-open verification. No native rebuild needed.

### Стабильность inline-виджетов при прокрутке

Уже показанный HelpHtmlSurface сохраняет экземпляр при переходах visible↔near.
Первый вход по-прежнему подготавливается только для visible, с отменяемыми2RAF;
никогда не показанные near не запускают загрузку. При deferred/retained поверхность
освобождается. Это ограниченный буфер, а не удержание всех WebView истории.
Смена аккаунта/resolver/дескриптора сбрасывает readiness и сохраняет прежние fences.


### Latest without recreating the visible last message (after OTA0.1.46.28)

The loaded-tail service fast path alone did not prevent a visual reload: Latest
still mounted a duplicate outgoing React tree. Stateful HTML/stream/file content
started again in that copy. When the loaded tail is less than one viewport away,
or the final row is already visible, Latest now scrolls the existing native list
with animation and creates no outgoing copy. Follow stays off until the real end
arrives; user drag cancels navigation. Native momentum completion handles geometry
growth during the scroll. Distant unloaded navigation retains the bounded viewport
transition. No native module or service/history changes are required.

Regression tests count mounts/unmounts across the action for native and fallback
scroll refs, cover a tall visible final row, interruption and the unloaded path.
305 targeted tests/types/ExpoDoctor20/20 pass. Device QA did not reach the chat:
Metro download stalled at42.9%; no visual-success claim. QA2 session was closed
without shutting down the emulator for the separate voice task.

### Уведомление, список и возврат (Metro, 2026-11-06)

Начальное Help-уведомление читается из native metadata с ограничением450ms.
`useAuthRedirect` подготавливает прямой маршрут ticket/message/event, пока
существующий стартовый экран закрывает смонтированный навигатор. Обычный
RootRedirect и второй reader MainLayout ждут окончания этой передачи. Ответ
уведомления поглощается после совпадения маршрута/параметров; общий координатор
не открывает его повторно и не очищает более новое уведомление или чужой аккаунт.

HelpScreen сохраняет список смонтированным, но скрывает его при прямом входе.
История подготавливается обычным local-first путём. Такой чат не запускает второй
вложенный сдвиг; возврат остаётся анимированным. Обычный вход в список использует
native-stack slide_from_right (none при reduced motion). Черновик, который ещё
не восстановился, не сохраняется как пустой при переходе.

`AppSceneTransition.dismiss` сначала коммитит удаление статического settled
transform, затем начинает UI-thread exit в layout effect. Это убирает гонку,
когда React/Fabric возвращал первый движущийся кадр к нулю. Блюр списка
освобождён на время готового перехода/возврата и восстанавливается после него;
при подготовке скрытой истории обычного открытия он остаётся видимым.

### Звуковая волна и тактильный отклик

Нативная запись сохраняет прежние pause/export/draft и80ms snapshot. Реальная
нормализованная амплитуда передаётся ограниченным массивом в HelpVoiceWave:
новый сигнал в центре, предыдущие значения расходятся симметрично. UI-thread
интерполяция100ms заменяет независимый таймер перерисовки. Тишина скрывает
минимальные точки и оставляет тонкую линию; пауза сохраняет обычную историю
для обрезки. Случайный/синтетический сигнал не генерируется.

helpHaptic использует существующий expo-haptics и нативные системные эффекты.
Send подтверждается один раз после durable acceptance, а не повторно после
server ACK. Ошибка отправки не даёт успешного отклика. Пользовательские
переходы записи, выбор/пропуск вопросов, реакции, вложения, меню и подтверждение
IT имеют короткий отклик. Polling, восстановление, фоновая пауза и web молчат;
недоступный haptic модуль не ломает действие. IME/dock/tail владельцы не менялись.

### Полноэкранный HTML: один владелец жеста

Нативный HelpHtmlViewer использует UI-thread manual RNGH Pan, а Gesture.Native
WebView ждёт его решения. Потягивание вниз от начала страницы/шапки двигает
весь просмотр; короткий/отменённый жест возвращает его обратно. Прокрутка ниже
начала, движение вверх/горизонтально и pinch передаются WebView. Вложенный
RN PanResponder остаётся только для web. Открытие и закрытие используют общие
progress/drag; Modal имеет собственный GestureHandlerRootView. JavaScript,
сеть, storage, внешняя навигация и мост внутри HTML остаются отключёнными.

Целевые regression suites и Android Metro bundle проверены. На Device MCP
локальных fixtures проверены возврат/повторное открытие чата, запуск и пауза
записи, открытие нативного HTML. Проверка HTML-жеста остановлена после ошибок
команды/ref; нельзя объявлять её нативно подтверждённой. Реальная cold-push
доставка и ощущение вибрации на телефоне не проверялись. Общий TypeScript сначала блокировался параллельными изменениями
entityCards/clientOrders; итоговая проверка прошла после их завершения, без наших
правок в этих файлах. Приватные доказательства: .dev-runtime/help-visual/interactions-*.


## Browser timeline animation bridge — 2026-11-06

Timeline readiness opacity must never construct an Animated.Value with a native
driver on web: setValue itself then requests an unavailable native tag before
any animation fallback can run. Readiness construction and timeline navigation
timings now use Platform.OS !== 'web'; Android/iOS keep their native driver.
The scroll event already had this platform guard. Existing opacity/tail/IME
owners and readiness geometry are unchanged.

A web/Android regression checks readiness across layout and empty-history
updates; web failed before the fix.202 targeted tests, types and ExpoDoctor20/20
passed. Real HelpScreen browser fixture reproduced the blank/error before and
rendered messages after. Public app.dev.lidprod.ru web bundle contains the fix;
authenticated public-chat flow was not tested. No OTA/native/API change.

## Initial history versus live tail — 2026-11-06

Opening a conversation leaves tail animation disarmed even after entry finishes.
Historical image measurements, header geometry, read receipts and repeated
copies of the same answer must not arm it. `helpTailContentChanged` compares real
message/assistant content and excludes history pagination. The timeline reports
`onLiveTailStart` only for a live content change after readiness; HelpScreen
enables native atomic tail animation for that specific account/scene. Reopening
the same ticket gets a new scene and starts disarmed. Native still owns actual
layout and keyboard movement; no native module changes are required here.

Visible read receipts are reevaluated after progress becomes a final message,
even when the row height is unchanged, and when the browser returns to the
foreground. Confirmed read sequence is persisted in the local history cache;
an older list/sync response cannot restore an already-read badge. Hidden tabs
and messages outside the visible area are not marked read by this change.

### Late history and offscreen measurements — 2026-11-06

Capture the first nonempty navigation target until positioning is ready, even
when FlashList has already fired `onLoad` for an empty viewport. Its deferred
initial-index replay must still pass through `helpOpeningScrollRef`; a real user
gesture or a different navigation target releases that ownership.

On web, FlashList's `scrollToEnd` schedules its final scroll in a timeout. After
entry, expanding `drawDistance` can replace offscreen height estimates and paint
one frame with the last message displaced before that timeout runs. Immediate
web tail alignment therefore uses the underlying ScrollView directly, including
the list's layout commit while following the tail. Manual scrolling and history
navigation disable it. Animated jumps retain the FlashList navigation path.
Android's existing pre-draw owner continues pinning with `animateTail=false`;
that flag disables presentation motion, not tail positioning.

QA `fixture.history.mixed` supplies 57 synthetic grouped messages with images,
audio, prior AI questions and closure events. Three repeat opens each at 1280px
and 390px plus a saved history anchor kept visible message displacement below
0.2px (layout rounding). This verifies real components with local data, not an
authenticated ticket replay. Device MCP was busy, so Android changes are covered
by regression tests and native ownership review, not new device visual proof.

### Direct route initialization — 2026-11-07

Open a URL-selected ticket in a passive effect after `useHelpService` initializes
the account. Starting it in a layout effect races the service's `clearSelection`:
the reset invalidates the request before the history read finishes, leaving the
scene waiting indefinitely. The initial route cover still hides unprepared UI;
entry remains gated by real timeline readiness rather than a delay.

Effect cleanup releases only its own consumed route intent, so React effect
replay can reopen after service reset without overwriting browser navigation.
Route restoration explicitly restarts selection when the account changes even
if the old render still has the same ticket ID. Normal row clicks and browser
Back retain their existing navigation behavior. Integrated screen tests use the
real service lifecycle, including cold mount, remount, account changes and
failed history requests; a fully mocked service cannot catch this race.

### Existing question panels during entry — 2026-11-07

HelpScreen passes `animate={entrySettled}` through HelpQuestionPanel to
HelpQuestionReveal. A historical question now takes its measured height directly
while the chat is prepared offscreen. Async draft restoration, collapsed state
and viewport measurements can update that height without replaying a 220ms
animation behind the loading cover. The timeline's positioning/readiness checks
remain unchanged. After entry, user collapse/expand retains the existing motion;
enabling animation at an already settled height does not start a redundant one.

Ticket 14's read-only metadata showed eight short messages, no attachments and a
completed legacy `clarify` answer. Its waiting label itself is plain text. The
matching synthetic fixture reproduces the actual question-panel path; control
ticket 15 has the same history with `answer`. Browser checks cover desktop and
compact entry, saved collapsed reopening and animated user interaction. This
does not assert live authenticated end-to-end latency for the owner's browser.

### Question presentation and web voice action — 2026-11-07

Web places question navigation and collapse beside the question text, wrapping
the controls on compact widths instead of reserving an empty toolbar above it.
Native keeps its existing touch layout. Every new chat opening expands a pending
question at its saved step; answers, selected options and attachment bindings
survive. Manual collapse remains effective during that opening. A new question
arriving while the user writes an ordinary message does not take over the input.

The web voice control uses one semantic button throughout recording, locking
and sending. Its icon is decorative; there is no nested button. The DOM node,
keyboard focus and gesture owner remain stable. Releasing the pointer that
started recording cannot send just because the control became Send while held.

### Выделение сообщений по референсу

Долгое нажатие включает множественное выделение, в том числе у ответов ИИ.
HelpMessageSelectionRow показывает слева26dp checkbox с белой обводкой,
зелёной заливкой выбранных и подсветкой на всю ширину. Native-driver180ms
сдвигает входящие на36dp; исходящие сохраняют правое выравнивание. Широкие
входящие ограничиваются шириной viewport минус gutter, чтобы не обрезать правый
край. Reduced motion применяет конечное положение сразу. Overlay переключает
выбор и блокирует дочерние действия, не захватывая вертикальный scroll.

В режиме выделения связанные question/reply имеют отдельные checkbox.
Выбор хранит снимки сообщений за пределами текущего окна; чат/аккаунт сбрасывают
его. Composer остаётся смонтированным/скрытым с сохранением состояния, вместо
него отображается кнопка пересылки. Верхняя панель содержит отмену, счётчик,
копирование и пересылку; одиночное обычное сообщение сохраняет доступ к старому
меню действий. API удаления сообщений отсутствует: корзина не имитируется.
Копирование и пересылка соблюдают sequence order, успешные части пересылки
не дублируются при повторе; смена навигации/аккаунта прекращает следующие send.
Tail presentation отключается во время выбора, геометрический baseline сохраняется.
