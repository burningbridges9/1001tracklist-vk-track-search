# 1001Tracklists → VK Track Search

Расширение Chrome, которое добавляет на 1001Tracklists кнопку поиска трека в
аудио VK. Продолжение двух соседних расширений:

Дата: 2026-10-18. Версия: **1.0.0**. Автотесты: **98/98** (jsdom).

## Коротко

- В конце каждого названия в треклисте появляется кнопка с лупой.
- Клик открывает страницу музыки VK с уже заполненным поиском:
  `https://vk.ru/audios<ID>?q=<запрос>`, где `q` закодирован **дважды**
  (`%2520` вместо `%20`) — VK сам декодирует параметр ещё раз.
- Запрос по умолчанию совпадает с подписью трека на сайте, включая микс и
  гостей: `Calvin Harris ft. Clementine Douglas - Blessings (KETTAMA Remix)`.
  Шаблон настраивается: `{name}`, `{artists}`, `{artist}`, `{mainArtist}`,
  `{title}`, `{mix}`, `{label}`.
- Строки «ID - ID» (трек не опознан) кнопки не получают — там нечего искать.
- Машапы ищутся по всей подписи строки, у подстрок машапа («Riordan - Feel The
  Funk») есть своя кнопка.
- ID владельца аудио расширение подсматривает в адресе `vk.ru/audios<ID>`;
  до первого такого визита ссылка идёт на `/audios?q=…`, а вкладка VK
  достраивает переход сама.
- Кнопка — обычная ссылка, поэтому Ctrl+клик и средний клик открывают поиск в
  фоне, а текст треклиста по-прежнему выделяется и копируется.

## Установка

1. Открыть `chrome://extensions`.
2. Включить «Режим разработчика».
3. «Загрузить распакованное расширение» → папка `extension/` (или
   `dist/1001tracklists-vk-track-search/` из сборки).
4. Обновить вкладку 1001Tracklists и вкладку VK, если они были открыты.

Готовая сборка: `dist/1001tracklists-vk-track-search-1.0.0.zip` (распаковывается
в папку, которую указывают в пункте 3).

## Как это работает

### 1. Где ищутся треки

Один трек в треклисте — это строка списка `div.tlpItem` (она же `div.bItm`):

```html
<div id="tlp_14587689" class="tlpTog bItm tlpItem trRow1"
     data-id="14587689" data-trackid="cyykzyxx" data-trno="0"
     onclick="rowToggle('tlp', event);">
  <img class="artwork artM" …>
  <div class="bPlay">…номер трека, cue…</div>
  <div class="bCont tl">
    <div id="tlp0_content" class="fontL" itemprop="tracks"
         itemscope itemtype="http://schema.org/MusicRecording">
      <meta itemprop="name" content="Dom Dolla &amp; Solomun &amp; Skepta - DANGER DANGER">
      <meta itemprop="byArtist" content="Dom Dolla &amp; Solomun &amp; Skepta">
      <meta itemprop="publisher" content="…HTML лейбла…">
      <meta itemprop="url" content="/track/cyykzyxx/…/index.html">
      <span class="trackValue notranslate blueTxt" id="tr_cyykzyxx">…подпись…</span>
      <span class="iBlock notranslate"><span class="trackLabel">THREE SIX ZERO</span></span>
    </div>
    …
  </div>
  <div class="iRow grow mediaRow">…YouTube / SoundCloud / Spotify / Apple…</div>
</div>
```

Подпись трека берётся из `meta[itemprop="name"]` — это чистый текст без
разметки, где `&amp;` уже раскодирован. `.trackValue` — тот же текст живой
разметкой: в нём ссылки на артистов, на страницу трека и на лейбл. Кнопка
вставляется **в конец `.trackValue`**, то есть сразу после названия и перед
лейблом.

Контейнером считается и `div.tlpItem`, и `div.bItm`: на других страницах
1001Tracklists `div.bItm` — это строка *треклиста*, а не трека. Такие строки
отсеиваются сами: в них нет ни `meta[itemprop="name"]`, ни `.trackValue`.
Проверено на снимке страницы трека (`test/fixture-other.html`): три строки
`.bItm` — ноль кнопок.

### 2. Как из подписи получается запрос

`common.js → parseTrackName` разбирает подпись по **первому** разделителю
` - ` / ` – ` / ` — `:

| Подпись на сайте | artists | title | mix |
|---|---|---|---|
| `Dom Dolla & Solomun & Skepta - DANGER DANGER` | `Dom Dolla & Solomun & Skepta` | `DANGER DANGER` | — |
| `Michael Bibi & KETTAMA ft. Wu-Tang Clan - MYSTERY OF RAW` | `Michael Bibi & KETTAMA ft. Wu-Tang Clan` | `MYSTERY OF RAW` | — |
| `Calvin Harris ft. Clementine Douglas - Blessings (KETTAMA Remix)` | `Calvin Harris ft. Clementine Douglas` | `Blessings` | `KETTAMA Remix` |
| `KETTAMA - Pretty Green Eyes (Sunset Ibiza Mix)` | `KETTAMA` | `Pretty Green Eyes` | `Sunset Ibiza Mix` |
| `Dom Dolla - girl$ (Layton Giordani Remix)` | `Dom Dolla` | `girl$` | `Layton Giordani Remix` |

Хвостовая скобка становится `{mix}` только если внутри есть слово из набора
`remix / edit / mix / bootleg / dub / vip / rework / …`. Поэтому:

- шаблон по умолчанию `{artists} - {title} ({mix})` собирает подпись обратно
  **без потерь**;
- если микса нет, скобки не появляются (`MK & Dom Dolla - Rhyme Dust`);
- скобка, которая не микс (`feat.`, `Live from …`), остаётся в названии.

`renderQuery(info, settings)` подставляет токены:

| Токен | Значение |
|---|---|
| `{name}` | вся подпись как на сайте |
| `{artists}` | все исполнители так, как они подписаны (`&`, `ft.`, `vs.`) |
| `{artist}` | то же (синоним) |
| `{mainArtist}` | только первый исполнитель |
| `{title}` | название без микса |
| `{mix}` | микс из хвостовой скобки |
| `{label}` | лейбл; если их несколько — через ` /` (`COLUMBIA / ULTRA`) |

Шаблон без `{title}` и без `{name}` считается негодным и заменяется значением
по умолчанию. Пустые `()` и висячие разделители вычищаются.

`{mainArtist}` — «первый по разделителю»: у `Above & Beyond` он даст `Above`.
Это осознанный компромисс, поэтому по умолчанию в запрос идут **все**
исполнители, как на сайте.

### 3. Ссылка поиска

```text
https://vk.ru/audios<ID>?q=<дважды URL-encoded запрос>
```

```js
encodeQuery('MK & Dom Dolla - Rhyme Dust')
  => 'MK%2520%2526%2520Dom%2520Dolla%2520-%2520Rhyme%2520Dust'
```

Почему дважды: VK декодирует параметр ещё раз, и в адресах, которые генерирует
сам сайт, пробел выглядит как `%2520`. Если у пользователя в строке поиска VK
видно `%20`, в настройках есть переключатель на одинарное кодирование.

Адрес всегда абсолютный на `https://vk.ru`: кнопка стоит на чужом домене,
поэтому `location.origin` брать нельзя.

ID владельца аудио (`<ID>`) берётся так:

1. `audioOwnerId` из настроек — если вписан вручную;
2. `detectedAudioOwnerId` из `chrome.storage.local` — ID, выученный на VK;
3. пусто → `https://vk.ru/audios?q=…`.

Учит ID скрипт `vk.js` (content script на `vk.ru`/`vk.com`): как только в
адресе появляется `/audios<ID>`, ID сохраняется.

Если ID ещё неизвестен, перед переходом запрос кладётся в
`chrome.storage.local.pendingAudioSearch = { query, ts }`. Вкладка VK,
открывшись:

- `q` в адресе уже есть — ничего не делает;
- адрес стал `/audios<ID>` без `q` — переходит на `/audios<ID>?q=…`;
- адрес остался `/audios` — ждёт SPA-перехода и повторяет проверку;
- запись живёт 2 минуты и стирается при первом использовании.

Запись делается на `pointerdown`/`mousedown`/`auxclick`, а не на `click`:
новая вкладка может начать загружаться раньше, чем завершится асинхронная
запись в storage.

### 4. Кнопка

```html
<a class="tl2vk-btn" data-tl2vk-btn data-tl2vk-key="14587689"
   data-tl2vk-query="Dom Dolla &amp; Solomun &amp; Skepta - DANGER DANGER"
   href="https://vk.ru/audios?q=Dom%2520Dolla%2520%2526%2520…"
   target="_blank" rel="noopener noreferrer"
   title="Найти «Dom Dolla & Solomun & Skepta - DANGER DANGER» в аудио VK">
  <svg>…лупа…</svg>
</a>
```

- это `<a href>`, а не `<button>`: бесплатно работают Ctrl+клик, средний клик,
  «открыть в новой вкладке» и контекстное меню браузера;
- `stopPropagation` на `click`, `mousedown`, `pointerdown`, `mouseup`,
  `auxclick` — иначе сработает `onclick="rowToggle(…)"` самой строки;
- `position: relative; z-index: 2`, `inline-flex`, фиксированные 16×16,
  `user-select: none` — кнопка не ломает строку и не мешает выделять текст;
- `data-tl2vk-key` — `data-id` строки; по нему проверяется, не стоит ли уже
  кнопка, и обновляется ли она после перерисовки.

### 5. Жизненный цикл страницы

- `MutationObserver` на `document.documentElement` (`childList`, `subtree`),
  сканирование с дебаунсом 250 мс.
- Проверка `location.pathname + search` раз в 900 мс — 1001Tracklists в
  основном обычный сайт, но переходы без перезагрузки встречаются.
- Скан ищет все `div.tlpItem, div.bItm`, читает подпись и приводит кнопки к
  текущему состоянию: существующие обновляются (`syncButton`), лишние
  удаляются (`pruneButtons`), вложенные контейнеры пропускаются.
- Изменения настроек (`chrome.storage.onChanged`) применяются сразу: кнопки
  удаляются, страница сканируется заново.
- При выключении кнопки удаляются, наблюдатель останавливается; на `<html>`
  висит класс `tl2vk-disabled`, который прячет кнопки через CSS.

## Настройки

`chrome.storage.sync`:

| Ключ | По умолчанию | Смысл |
|---|---|---|
| `enabled` | `true` | Расширение включено. |
| `queryTemplate` | `{artists} - {title} ({mix})` | Шаблон запроса. |
| `openInNewTab` | `true` | Открывать поиск в новой вкладке. |
| `queryEncoding` | `double` | Двойное кодирование `q` (как у VK). |
| `audioOwnerId` | `''` | Ручной ID владельца аудио. |

`chrome.storage.local`:

- `detectedAudioOwnerId` — ID, подсмотренный в адресе `/audios<ID>`;
- `pendingAudioSearch` — отложенный запрос на случай, если VK потеряет `q`
  при редиректе.

Страница настроек показывает предпросмотр на живом примере из треклиста
(`Calvin Harris ft. Clementine Douglas - Blessings (KETTAMA Remix)`) и строку
«ID владельца аудио определён автоматически: …».

## Ограничения

- Всё держится на разметке 1001Tracklists: `.tlpItem`, `.trackValue`,
  `meta[itemprop="name"]`. Сайт может её поменять — тогда правится
  `extension/content.js` (селекторы собраны в начале файла).
- Поддерживаются страницы, где треки лежат строками `.tlpItem`/`.bItm` с
  `.trackValue` — то есть треклисты. Страницы `/track/…` и `/artist/…` в этой
  версии не обрабатываются: их разметку не удалось снять (сайт отдаёт на них
  капчу), а гадать по селекторам — значит ломать вёрстку.
- Строки «ID - ID» пропускаются: искать нечего. Если опознан только
  исполнитель или только название, в запрос идёт известная часть.
- Машап ищется по всей подписи строки (`A vs. B - C vs. D (Edit)`); в VK такой
  строкой трек обычно не подписан. У подстрок машапа есть свои кнопки — они
  точнее.
- Первый поиск без выученного ID идёт через редирект VK и отложенный запрос;
  если VK поменяет поведение — смотреть `handlePendingSearch` в `vk.js`.
- Апострофы и типографика уходят как есть (`John O’Callaghan`). Если VK не
  находит трек, а с ASCII `'` находит — нужна нормализация в `renderQuery`.

## Разработка

```text
extension/
  manifest.json
  common.js            настройки по умолчанию, разбор подписи, запрос, ссылка
  content.js           вся логика страницы 1001Tracklists
  content.css          стиль кнопки
  vk.js                ID владельца аудио и достройка потерянного q
  background.js        клик по иконке открывает настройки
  options.html/css/js  страница настроек
  icons/               иконки 16/32/48/128
test/
  fixture.html                 10 строк треклиста из живой страницы
  fixture-other.html           страница трека: строки .bItm — треклисты
  reference/tracklist-page.html полный снимок живой страницы (38 строк)
  run-tests.mjs                тесты на jsdom
tools/
  build.ps1            сборка dist/ и ZIP
  make_icons.py        генерация иконок
  research/            скачивание и разбор разметки сайта (см. HANDOFF §6.3)
dist/
  1001tracklists-vk-track-search-1.0.0.zip
```

Тесты:

```bash
node test/run-tests.mjs
```

Сборка (с тестами):

```powershell
powershell -ExecutionPolicy Bypass -File tools\build.ps1 -Test
```

### Что проверяют тесты

- **9 кнопок из 10 строк** фикстуры, строка «ID - ID» пропущена.
- Запрос для каждого вида подписи: три артиста через `&`, `ft.`, два лейбла,
  микс в скобках, `$` в названии, машап и его подстрока.
- **Эталон запроса — сам сайт.** У каждой строки в `.mediaRow` есть ссылка
  «поиск в Google» с той же подписью. Тест декодирует её и сравнивает с нашим
  `data-tl2vk-query` — на всех 37 треках полной страницы совпадает.
- Позиция кнопки: последний элемент `.trackValue`, лейбл остаётся после неё.
- Шаблоны `{name}`, `{artists}`, `{artist}`, `{mainArtist}`, `{title} {artists}`,
  `{label}` и откат негодного шаблона.
- ID владельца аудио (ручной, выученный, нечисловой) и оба кодирования.
- Клик не всплывает до `onclick="rowToggle(…)"` строки; отложенный запрос
  пишется только пока ID неизвестен.
- Перерисовка: удаление строки убирает кнопку, клон строки получает свою,
  смена адреса не плодит дубликаты.
- Страница без треков: три строки `.bItm` — ноль кнопок.
- Скрипт на стороне VK: обучение ID, достройка `q`, просроченная запись,
  одинарное кодирование.
- Страница настроек и манифест.