# HANDOFF — поиск треков в VK с 1001tracklists

Дата: 2026-10-18. Репозиторий: `1001tracklist-vk-track-search`, версия **1.0.0**,
тесты **98/98** (jsdom).
Соседние репозитории: `vk-tracklist-track-search` (трек берётся из текста поста
VK) и `beatport-vk-track-search` (со страницы Beatport).

> Этот файл можно приложить к новой сессии как контекст: в нём постановка
> задачи, снятая с живого сайта разметка, алгоритм, грабли и чек-лист приёмки.

---

## 1. Задача и что получилось

В треклистах на 1001Tracklists нужна кнопка рядом с каждым треком: нажал —
открылся поиск этого трека в аудио VK, с уже подставленным запросом.

```text
[1001Tracklists]  --кнопка-->  https://vk.ru/audios<ID>?q=<запрос>
        |                              ^
        |  DOM: meta[itemprop=name]     |
        +---- common.js: разбор подписи, шаблон, двойное кодирование,
              vk.js: ID владельца аудио и достройка потерянного q
```

Что сделано:

| Возможность | Где живёт |
|---|---|
| Адрес поиска и кодирование | `common.js` — `encodeQuery`, `buildSearchUrl` |
| Разбор подписи трека | `common.js` — `parseTrackName`, `isUnidentified` |
| Шаблон запроса | `common.js` — `renderQuery` |
| ID владельца аудио, отложенный запрос | `vk.js` + `chrome.storage` |
| Кнопка и её поведение | `content.js`, `content.css` |
| Настройки | `options.html/css/js` |
| Тесты на jsdom | `test/run-tests.mjs`, `test/fixture*.html` |
| Сборка | `tools/build.ps1`, `tools/make_icons.py` |

Страницы, на которых работают кнопки: **треклисты 1001Tracklists**
(`/tracklist/…`). Страницы `/track/…` и `/artist/…` в этой версии не
обрабатываются — см. п. 6.2, там объяснено почему.

---

## 2. Что перенесено из beatport-репозитория без изменений

Схема и весь «несайтовый» слой переехали как есть, поменялся только префикс
(`bp2vk` → `tl2vk`) и тексты:

- `common.js` — `encodeQuery`, `buildSearchUrl`, `renderQuery`, `DEFAULTS`;
- `vk.js` — обучение ID из адреса `/audios<ID>` и достройка потерянного `q`;
- `background.js` — клик по иконке открывает настройки;
- `options.html/css/js` — те же переключатели, шаблон с пресетами и токенами,
  предпросмотр «запрос + готовый URL», ID владельца аудио, сброс;
- `tools/build.ps1`, `tools/make_icons.py`;
- каркас `test/run-tests.mjs`: заглушка `chrome.storage`, `waitFor`,
  `afterMutation` по счётчику `data-tl2vk-scans`.

Что действительно новое — только `content.js` для 1001Tracklists и разбор
подписи в `common.js`. Контракт, завязанный на content script:

| Что | Значение |
|---|---|
| Класс кнопки | `a.tl2vk-btn` |
| Атрибуты | `data-tl2vk-btn`, `data-tl2vk-query`, `data-tl2vk-key` |
| Готовность страницы | `<html data-tl2vk-scans="N" class="tl2vk-ready">` |
| Выключено | `<html class="tl2vk-disabled">` — CSS прячет кнопки |
| Поиск всех кнопок | `document.querySelectorAll('a.tl2vk-btn')` |
| Событие ремонта `q` на VK | `document` → `tl2vk:repair` |

---

## 3. Разметка 1001Tracklists, снятая с живой страницы

Один трек в треклисте — это строка `div.tlpItem` (класс `bItm` есть у всех
таких строк). Живая страница: 38 таких строк, у 37 есть микроразметка
`MusicRecording`, одна — «ID - ID».

```html
<div id="tlp_14587689" class="tlpTog bItm tlpItem trRow1"
     data-trno="0" data-id="14587689" data-isided="true" data-trackid="cyykzyxx"
     onclick="rowToggle('tlp', event);">
  <img data-src="https://geo-media.beatport.com/…" src="…"
       class="artwork artM lazy-loaded" width="100" height="100" alt="… Artwork">
  <div class="bPlay">
    <input id="tlp14587689_cue_seconds" type="hidden" value="0" form="frmEditTracklist">
    <span id="tlp0_tracknumber_value" class="fontXL"> 01 </span>
    <div id="cue_14587689" class="cue noWrap action mt5" data-mode="hours"></div>
  </div>
  <div class="bCont tl">
    <div id="tlp0_content" class="fontL" itemprop="tracks"
         itemscope itemtype="http://schema.org/MusicRecording">
      <meta itemprop="name"      content="Dom Dolla &amp; Solomun &amp; Skepta - DANGER DANGER">
      <meta itemprop="byArtist"  content="Dom Dolla &amp; Solomun &amp; Skepta">
      <meta itemprop="publisher" content="&lt;span class=&quot;blueTxt&quot;&gt;…THREE SIX ZERO…">
      <meta itemprop="duration"  content="PT4M55S">
      <meta itemprop="genre"     content="Tech House">
      <meta itemprop="url"       content="/track/cyykzyxx/dom-dolla-solomun-skepta-danger-danger/index.html">
      <span class="trackValue notranslate blueTxt" id="tr_cyykzyxx">
        <span class="notranslate blueTxt">Dom Dolla<a class="tgHid" href="/artist/dom-dolla/tracks.html">…</a></span>
        <span class="spLR"> &amp; </span>
        <span class="notranslate blueTxt">Solomun<span class="tgHid"><a href="/artist/solomun/tracks.html">…</a></span></span>
        <span class="spLR"> &amp; </span>
        <span class="notranslate blueTxt">Skepta<span class="tgHid"><a href="/artist/skepta/tracks.html">…</a></span></span>
        <span class="notranslate"> - </span>
        <span class="blueTxt">DANGER DANGER<span class="tgHid spL"><a href="/track/cyykzyxx/…">…</a></span></span>
      </span>
      <span class="iBlock notranslate" translate="no">
        <span title="label" class="trackLabel noWrap blueTxt">THREE SIX ZERO<a class="tgHid" href="/label/gv2bmz/…">…</a></span>
      </span>
      <span title="copy track name" class="fa fa-copy fa-20 blueTxt action tgHid mA spL"></span>
    </div>
    <div class="wRow halfOpacity mt5">…играет, айдишник, plays…</div>
    <div class="flex mt5"></div>
  </div>
  <div class="iRow grow mediaRow" data-trackid="1194883">
    <i class="mAction fa fa-video-camera"></i> … YouTube
    <i class="mAction fa fa-soundcloud"></i>   … SoundCloud
    <i class="mAction fa fa-spotify"></i>      … Spotify
    <i class="mAction fa fa-apple"></i>        … Apple Music
    <i class="mAction fa fa-shopping-cart"></i>… магазин
    <span class="badge badgeSpotify">Save 0</span>
    <a href="https://www.google.com/search?q=Dom+Dolla+%26+…" class="mAction"><i class="fa fa-search"></i></a>
  </div>
  <div class="fa fa-bars action mBtn interaction"></div>
</div>
```

Важные детали:

- **`meta[itemprop="name"]` — лучший источник подписи**: чистый текст, `&amp;`
  уже раскодирован, разметки нет. `.trackValue` — тот же текст живой
  разметкой (ссылки на артистов и на трек).
- `meta[itemprop="byArtist"]` **не равен** подписи: гостей он не содержит
  (`Michael Bibi & KETTAMA ft. Wu-Tang Clan` → `byArtist = "Michael Bibi"`).
  Поэтому артисты разбираются из подписи, а не из `byArtist`.
- `meta[itemprop="publisher"]` — **HTML в атрибуте** (экранированный), поэтому
  лейбл читается не из него, а из готовых узлов `.trackLabel`.
- `data-id` — id строки (уникален, годится в ключ кнопки); `data-trackid` —
  id трека на сайте и есть только у строк ровно с одним треком (29 из 38).
- `role="button"`-иконки и вся `.mediaRow` — это действия сайта, кнопку туда
  не ставим.

Варианты строк, которые встретились на одной странице:

| Что | Как выглядит | Кнопка? |
|---|---|---|
| Обычный трек | `Dom Dolla & Solomun & Skepta - DANGER DANGER` | да |
| С гостем | `Michael Bibi & KETTAMA ft. Wu-Tang Clan - MYSTERY OF RAW` | да |
| Ремикс | `Calvin Harris ft. Clementine Douglas - Blessings (KETTAMA Remix)` | да |
| Два лейбла | `COLUMBIA` + `ULTRA` (два `.trackLabel`) | да |
| Машап | `Dom Dolla & Daya & Anyma vs. Riordan - Dreamin vs. Feel The Funk (Dom Dolla Edit)`, у строки `data-mashup`, у контента класс `bootleg`, у подписи — `mashupTrack` | да, по всей подписи |
| Подстрока машапа | отдельная строка ниже, `data-trackid` нет | да |
| «ID - ID» | `.trackValue.redTxt`, **нет `meta[itemprop="name"]`**, подпись склеена из `span`-ов | **нет** |

---

## 4. Алгоритм: подпись → запрос

### 4.1. `parseTrackName(name)`

1. Подпись берётся из `meta[itemprop="name"]`; если её нет — из
   `.trackValue.textContent`.
2. Делится по **первому** разделителю ` - ` / ` – ` / ` — ` (с пробелами).
   Первый, потому что в названии дефисы возможны, а в артистах — нет.
3. Если «артист» оказался ровно `ID` — артистов нет, ищем по названию.
4. Хвостовая скобка `(…)` становится `mix`, только если внутри есть слово из
   набора `remix|remode|rework|refix|edit|mix|bootleg|flip|vip|dub|mashup|
   blend|acapella|acappella|instrumental|extended|tool`. Иначе скобка остаётся
   частью названия (`(Live from …)`, `(feat. …)`).
5. `artists` — массив для `{mainArtist}`: делится по `&`, `+`, `,`, `vs.`,
   `ft.`, `feat.`.

### 4.2. Почему шаблон по умолчанию — `{artists} - {title} ({mix})`

На 1001Tracklists микс — это **часть подписи** (`Blessings (KETTAMA Remix)`), а
не отдельное поле, как на Beatport. Если бы `{title}` содержал скобку целиком,
токен `{mix}` дублировал бы её, а шаблон `{artists} - {title}` молча терял бы
микс. Поэтому:

- `title` — название **без** микса;
- `mix` — содержимое хвостовой скобки;
- шаблон по умолчанию собирает подпись обратно **без потерь**;
- «нет микса → нет скобок» делает `renderQuery` (убирает `({mix})` целиком).

Проверка глазами: у 37 треков живой страницы запрос совпадает с тем, что сам
сайт подставляет в свою же ссылку «поиск в Google». Это лучший тест на разбор,
чем любая таблица ожиданий (см. п. 7).

### 4.3. «ID - ID» и строки без `meta[name]`

`textContent` такой строки — `"ID" + "-" + ""` = `ID-`, без пробелов вокруг
дефиса. Поэтому `isUnidentified` сначала срезает хвостовые разделители, и
только потом проверяет `^id$` / `^id\s*[-–—]\s*id$`. Плюс страховка: если
`title` после разбора равен `ID` — кнопки нет.

---

## 5. Почему кнопка внутри `.trackValue`

`.trackValue` — `<span>` с подписью; заголовок трека лежит в нём последним
`<span>`, за ним идут скрытая ссылка (`span.tgHid.spL`), затем `.iBlock` с
лейблом и иконка «скопировать». `appendChild` в `.trackValue` ставит кнопку
ровно в конец названия, перед лейблом:

```text
MK & Dom Dolla - Rhyme Dust [🔍] COLUMBIA/ULTRA
```

Альтернативы, которые отвергнуты:

- `.mediaRow` — там иконки медиа, но у половины треков она свёрнута/пустая;
- `.wRow` — это статистика (plays, айдишник), к названию отношения не имеет;
- после `.trackLabel` — кнопка уезжает за лейбл и хуже находится глазами.

Внутри `.trackValue` кнопка ещё и не попадает в `copyPaste('#tlp0_content')`:
у неё нет текста, только `<svg>`, поэтому «скопировать название» отдаёт ровно
то, что было.

---

## 6. Методика: как снималась разметка

### 6.1. Что сработало

1. **Скачать страницу треклиста обычным urllib с браузерным UA**,
   `Accept-Language`, `Accept-Encoding: gzip`. Отдаётся 200 и полный HTML
   (310 КБ), скрипты не нужны — разметка SSR, строки в HTML есть.
2. **Гистограмма классов и `data-*`** по документу: `.tlpItem` (38),
   `.trackValue` (38), `data-id` (39), `data-trackid` (64 — есть и у вложенных
   `.mediaRow`). Сразу видно, что строка трека — `.tlpItem`.
3. **Проверять селекторы скриптом по сохранённому HTML, а не глазами**:
   для каждой строки печатались `meta[name]`, `byArtist`, `publisher`, `url`,
   дети `.trackValue` и родители. Так нашлись и машапы, и строка без мета.
4. **Группировать варианты**: подпись «шаблон детей `.trackValue`» и
   «последний ребёнок» — по этим сигнатурам видно все 12 вариантов строки
   (обычная, `ft.`, `vs.`, микс, `mashupTrack`, `redTxt`…), а не 38 глазами.
5. **Прогнать настоящий content script в jsdom на полном снимке страницы**
   (не на фикстуре) и сверить запрос с Google-ссылкой сайта — так пойманы
   расхождения, которых не видно на 10 строках.

### 6.2. Что не сработало и почему

- **`/track/…` и `/artist/…` отдают 401 + капчу** («We need to validate your
  are real human»). Ни urllib, ни `curl`, ни `web_fetch` их не получают;
  cookie от главной и Referer не помогают. Поэтому страницы трека и артиста в
  эту версию не входят: разметку не снять, а угадывать селекторы — ломать
  вёрстку.
- **Wayback** для этих страниц работает, но снимки старые (2024). По ним
  видно, что на странице трека `itemtype="…MusicRecording"` висит на
  `<html>` — как «хост» это бесполезно, а `<h1>` там состоит из артистов и
  лейбла, а не из названия трека. Вывод: универсального «где название» на
  других типах страниц нет, нужна отдельная работа.
- **`lxml.cssselect` недоступен** (нет пакета `cssselect`) — все проверки
  написаны на XPath.
- **Консоль Windows в cp1251** валит `print` на не-ASCII — перед запуском
  скриптов ставить `PYTHONIOENCODING=utf-8`.
- **Headless Chrome в песочнице не поднимается** (падает на именованных
  каналах `platform_channel.cc`, «Отказано в доступе»). Скриншоты и живой
  прогон в браузере в этой среде невозможны — проверка только jsdom.

### 6.3. Как обновить снимки, если понадобится

Инструменты лежат в репозитории (`tools/research/`), скачанный HTML — в `_ref/`
(эта папка в `.gitignore`):

```powershell
# 1. Скачать страницы (urllib + браузерный UA + gzip, cookie сохраняются)
python tools/research/fetch.py "<url треклиста>" "_ref/tracklist.html"

# 2. Разобрать: строки, meta, дети .trackValue; варианты подписей и машапы
python tools/research/analyze.py _ref/tracklist.html rows
python tools/research/analyze-rows.py _ref/tracklist.html

# 3. Пересобрать фикстуры из настоящих строк
python tools/research/cut-fixtures.py
```

`cut-fixtures.py` пересобирает разом `test/fixture.html`,
`test/fixture-other.html` и `test/reference/tracklist-page.html`, вырезая
`script`/`iframe` из снимка. Страница трека для `fixture-other.html` качается
отдельно — с Wayback (`https://web.archive.org/web/<ts>id_/<url>`), потому что
живая отдаёт капчу.


---

## 7. Тесты

`test/run-tests.mjs` — 98 проверок, 10 блоков:

1. Разметка и запрос по умолчанию: 9 кнопок из 10 строк, «ID - ID» пропущена,
   точные запросы для каждого вида подписи, позиция кнопки, ключ, target/rel.
2. Шаблоны: `{name}`, `{artists}`, `{artist}`, `{mainArtist}`, `{title} {artists}`,
   `{label}` с двумя лейблами, откат негодного шаблона.
3. ID владельца аудио (ручной / выученный / нечисловой) и оба кодирования.
4. Поведение: клик и `mousedown` не всплывают до `rowToggle`; отложенный запрос
   пишется только без ID; смена шаблона и выключение применяются на месте.
5. Перерисовка: удаление строки, клон строки, `pushState`.
6. Страница без треков: три строки `.bItm` (треклисты) — ноль кнопок.
7. **Полная живая страница**: 38 строк → 37 кнопок, у всех 37 запрос совпадает
   с Google-ссылкой сайта, дублей нет.
8. Скрипт на стороне VK: обучение ID, достройка `q`, просрочка, кодирование.
9. Страница настроек.
10. Манифест.

Ожидания — на условиях, а не на паузах: content script пишет на `<html>`
счётчик `data-tl2vk-scans`, тест ждёт `N > предыдущего` (`afterMutation`).

Сборка:

```powershell
powershell -ExecutionPolicy Bypass -File tools\build.ps1 -Test
```

`build.ps1` проверяет, что все файлы из манифеста на месте, гоняет тесты и
пакует `dist\1001tracklists-vk-track-search-<версия>.zip`.

---

## 8. Грабли (симптом → причина → решение)

**8.1. Кнопка на строке «ID - ID».**
Причина: у такой строки нет `meta[itemprop="name"]`, а `textContent` даёт `ID-`
без пробелов — регулярка на `ID - ID` не срабатывает.
Решение: `isUnidentified` срезает хвостовые `-–—:,` перед проверкой.

**8.2. Микс пропадает из запроса.**
Причина: на 1001Tracklists микс — часть названия, а не отдельное поле.
Решение: `title` без микса + `mix` из хвостовой скобки, шаблон по умолчанию
`{artists} - {title} ({mix})`.

**8.3. `()` в запросе у треков без микса.**
Причина: шаблон содержал скобки вокруг `{mix}`.
Решение: `renderQuery` вырезает `({mix})` целиком, если микса нет, и ещё раз
чистит пустые скобки в конце.

**8.4. Кнопка на строке треклиста вместо трека.**
Причина: `div.bItm` — общий класс; на странице трека это строки «появляется в
треклистах».
Решение: `readInfo` требует подпись (`meta[itemprop="name"]` или
`.trackValue`), иначе строка молча пропускается. Тест — `fixture-other.html`.

**8.5. Запрос содержит только одного артиста / теряет `ft.`.**
Причина: если брать артистов из `meta[itemprop="byArtist"]`, гостей там нет.
Решение: артисты разбираются из подписи (`meta[itemprop="name"]`), `byArtist`
не используется вовсе. `{mainArtist}` — отдельный токен для тех, кто хочет
сократить запрос.

**8.6. После клонирования строки у кнопки чужой ключ.**
Причина: кнопка клонируется вместе со строкой, `syncButton` обновлял только
`href`/`title`/`query`, а `data-tl2vk-key` оставался от прежнего трека.
Решение: `syncButton` синхронизирует и ключ (этот баг поймал тест
«у клона свой ключ»).

**8.7. Тесты падают на полной странице из-за ошибок CSS.**
Причина: jsdom не понимает часть современного CSS сайта и сыплет
`jsdomError: Could not parse CSS stylesheet`.
Решение: такие сообщения отфильтрованы в `IGNORED` рядом с
`Not implemented: navigation`.

**8.8. Снимок живой страницы ломает тесты.**
Причина: в снимке остаются `<script>` сайта (jQuery, реклама, `rowToggle`).
Решение: при сборке `test/reference/tracklist-page.html` вырезаются `script`,
`iframe`, `noscript`; inline-`onclick` у строк оставлены намеренно — на них
проверяется, что клик по кнопке не всплывает.

**8.9. `Set-Content -Encoding UTF8` ломает JSON (из beatport-handoff).**
Причина: BOM. Решение: писать файлы инструментом, а не PowerShell, либо
`[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))`.

**8.10. Кнопка уводит на страницу трека сайта.**
Причина: у строки свой `onclick="rowToggle('tlp', event)"`, у названия —
ссылки на артистов и трек.
Решение: `stopPropagation` на пяти событиях + `z-index: 2`; кнопка — `<a href>`,
а не вложенная в чужую ссылку.

---

## 9. Чек-лист приёмки

- кнопка есть у каждого опознанного трека треклиста и ровно одна;
- запрос совпадает с подписью сайта (включая `ft.`, `&`, `vs.` и микс);
- строка «ID - ID» кнопки не получает;
- кнопка стоит в конце названия, перед лейблом, не ломая строку;
- Ctrl+клик и средний клик открывают поиск в фоне;
- клик не уводит на страницу артиста/трека сайта;
- после перерисовки и перехода кнопок столько же, сколько треков (нет дублей
  и «сирот»);
- первый поиск работает даже без выученного ID владельца аудио;
- тесты зелёные, `dist/*.zip` собирается, README и HANDOFF актуальны.

---

## 10. Ограничения

- Всё держится на разметке: `.tlpItem`, `.trackValue`, `meta[itemprop="name"]`.
  Классы на сайте меняются — селекторы собраны в начале `content.js`.
- `/track/…` и `/artist/…` не поддерживаются (капча при съёмке разметки).
- Одна строка = один запрос. У машапа в одной строке несколько треков —
  запрос уходит по всей подписи; точнее искать по подстрокам машапа, у них
  свои кнопки.
- Если трек опознан частично (`ID - Feel The Funk`), ищется известная часть.
- Без выученного ID первый клик идёт через редирект VK и отложенный запрос.
- Апострофы и типографика уходят как есть; если VK не находит — нужна
  нормализация в `renderQuery`.

---

## 11. Если сайт что-то поменял

1. Обновить вкладку и проверить, что расширение включено.
2. В DevTools: у `<html>` есть `data-tl2vk-scans`? Нет — скрипт не запускался.
3. Есть ли на странице `div.tlpItem`/`div.bItm` и `meta[itemprop="name"]`
   внутри строки?
4. Пропала кнопка у отдельного трека — посмотреть, чем отличается его строка:
   есть ли `.trackValue`, нет ли класса `redTxt`.
5. Проверить, куда попадает кнопка: `a.tl2vk-btn` → `parentElement`.
6. Поправить селекторы в начале `extension/content.js`, переснять фикстуру
   (п. 6.3), прогнать `node test/run-tests.mjs`.

Ключевые функции:

- `content.js` — `hosts`, `readInfo`, `readLabel`, `insertionPoint`, `scan`,
  `pruneButtons`, `syncButton`;
- `common.js` — `parseTrackName`, `isUnidentified`, `renderQuery`, `encodeQuery`,
  `buildSearchUrl`;
- `vk.js` — `refresh`, `resolvePending`.
