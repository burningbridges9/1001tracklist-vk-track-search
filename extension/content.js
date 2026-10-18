/*
 * 1001Tracklists → VK Track Search — content script для 1001tracklists.com.
 *
 * Рядом с каждым треком в треклисте добавляется кнопка, открывающая поиск
 * этого трека в аудио VK:
 *
 *   https://vk.ru/audios<ID>?q=<дважды URL-encoded запрос>
 *
 * Разметка 1001Tracklists, на которой всё держится (снята с живой страницы
 * треклиста). Один трек — это строка списка:
 *
 *   <div id="tlp_14587689" class="tlpTog bItm tlpItem trRow1"
 *        data-id="14587689" data-trackid="cyykzyxx" data-trno="0">
 *     <img class="artwork artM" …>
 *     <div class="bPlay">…номер трека, cue…</div>
 *     <div class="bCont tl">
 *       <div id="tlp0_content" class="fontL" itemprop="tracks"
 *            itemscope itemtype="http://schema.org/MusicRecording">
 *         <meta itemprop="name" content="Dom Dolla &amp; Solomun &amp; Skepta - DANGER DANGER">
 *         <meta itemprop="byArtist" content="Dom Dolla &amp; Solomun &amp; Skepta">
 *         <meta itemprop="publisher" content="…HTML лейбла…">
 *         <meta itemprop="url" content="/track/cyykzyxx/…/index.html">
 *         <span class="trackValue notranslate blueTxt" id="tr_cyykzyxx">…подпись…</span>
 *         <span class="iBlock notranslate"><span class="trackLabel">THREE SIX ZERO</span></span>
 *       </div>
 *       …
 *     </div>
 *     <div class="iRow grow mediaRow">…иконки YouTube/SoundCloud/Spotify…</div>
 *   </div>
 *
 * Что из этого важно:
 *
 *   1) контейнер одного трека — `div.tlpItem` (он же `div.bItm`); на страницах
 *      другого типа `div.bItm` может быть строкой *треклиста*, а не трека —
 *      такие строки отсеиваются, потому что в них нет `.trackValue`;
 *   2) подпись трека — `meta[itemprop="name"]` (чистый текст, без разметки);
 *      `content` у meta декодирован, `&amp;` уже стал `&`;
 *   3) `.trackValue` — то же самое, но живой разметкой: там ссылки на артистов
 *      и на страницу трека, а у неопознанных треков — «ID»;
 *   4) строка «ID - ID» не имеет meta[name] и помечена классом `redTxt` —
 *      кнопки она не получает;
 *   5) у машапа (`data-mashup`, `itemprop="tracks"` с классом `bootleg`)
 *      несколько треков в одной строке — ищем по всей подписи.
 *
 * Кнопка вставляется внутрь `.trackValue`, то есть встаёт в конец названия,
 * перед лейблом. При перерисовке страницы кнопки не дублируются, а лишние
 * удаляются.
 */
(function () {
  'use strict';

  if (window.__tl2vkContentLoaded) return;
  window.__tl2vkContentLoaded = true;

  var DEFAULTS = (window.TL2VK && window.TL2VK.DEFAULTS) || {
    enabled: true,
    queryTemplate: '{artists} - {title} ({mix})',
    openInNewTab: true,
    queryEncoding: 'double',
    audioOwnerId: ''
  };
  var VK_ORIGIN = (window.TL2VK && window.TL2VK.VK_ORIGIN) || 'https://vk.ru';

  var BTN_CLASS = 'tl2vk-btn';
  var BTN_SELECTOR = 'a.' + BTN_CLASS;
  var BTN_ATTR = 'data-tl2vk-btn';
  var KEY_ATTR = 'data-tl2vk-key';
  var QUERY_ATTR = 'data-tl2vk-query';

  // Где 1001Tracklists показывает трек.
  var TRACK_ROW = 'div.tlpItem';
  var LIST_ITEM = 'div.bItm';
  var HOST_SELECTOR = [TRACK_ROW, LIST_ITEM].join(',');

  // Внутри строки: подпись трека и блок микроданных MusicRecording.
  var NAME_BLOCK = '.trackValue';
  var CONTENT_BLOCK = '[itemprop="tracks"]';
  var NAME_META = 'meta[itemprop="name"]';
  var LABEL_NODE = '.trackLabel';

  var ICON_SVG =
    '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true" focusable="false">' +
    '<circle cx="6.9" cy="6.9" r="4.2" stroke="currentColor" stroke-width="1.7"></circle>' +
    '<path d="M10.2 10.2 14 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>' +
    '</svg>';

  var settings = {};
  var detectedOwnerId = '';
  var scans = 0;
  var scanTimer = null;
  var routeTimer = null;
  var observer = null;
  var lastRoute = '';

  /* ------------------------------------------------------------------ */
  /* Мелкие помощники                                                    */
  /* ------------------------------------------------------------------ */

  function qsa(selector, root) {
    var out = [];
    var scope = root || document;
    try {
      out = Array.prototype.slice.call(scope.querySelectorAll(selector));
    } catch (e) {
      out = [];
    }
    return out;
  }

  function normalizeText(value) {
    if (window.TL2VK && typeof window.TL2VK.normalizeText === 'function') {
      return window.TL2VK.normalizeText(value);
    }
    return String(value == null ? '' : value)
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ------------------------------------------------------------------ */
  /* Настройки                                                           */
  /* ------------------------------------------------------------------ */

  function applySettings(values) {
    settings = Object.assign({}, DEFAULTS, values || {});

    settings.enabled = settings.enabled !== false;
    settings.openInNewTab = settings.openInNewTab !== false;
    settings.queryEncoding = settings.queryEncoding === 'single' ? 'single' : 'double';

    var template = normalizeText(settings.queryTemplate);
    // Шаблон обязан содержать название трека, иначе поиск теряет смысл.
    if (!template || (template.indexOf('{title}') === -1 && template.indexOf('{name}') === -1)) {
      template = DEFAULTS.queryTemplate;
    }
    settings.queryTemplate = template;

    settings.audioOwnerId = String(settings.audioOwnerId || '').trim();
    if (!/^\d{1,20}$/.test(settings.audioOwnerId)) settings.audioOwnerId = '';
  }

  function storageGet(area, defaults, callback) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage[area]) {
        chrome.storage[area].get(defaults, function (values) {
          try {
            if (chrome.runtime && chrome.runtime.lastError) {
              callback(defaults);
              return;
            }
          } catch (e) { /* ignore */ }
          callback(values || defaults);
        });
        return;
      }
    } catch (e) { /* ignore */ }
    callback(defaults);
  }

  function storageSet(area, values) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage[area]) {
        chrome.storage[area].set(values);
      }
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------ */
  /* Адрес поиска в VK                                                   */
  /* ------------------------------------------------------------------ */

  function currentOwnerId() {
    return settings.audioOwnerId || detectedOwnerId || '';
  }

  function encodeQuery(query) {
    if (window.TL2VK && typeof window.TL2VK.encodeQuery === 'function') {
      return window.TL2VK.encodeQuery(query, settings.queryEncoding);
    }
    // VK кодирует параметр поиска ещё раз, поэтому в адресах сайта пробел
    // выглядит как %2520, а не %20.
    var once = encodeURIComponent(query);
    return settings.queryEncoding === 'single' ? once : encodeURIComponent(once);
  }

  function buildSearchUrl(query) {
    if (window.TL2VK && typeof window.TL2VK.buildSearchUrl === 'function') {
      return window.TL2VK.buildSearchUrl(query, currentOwnerId(), settings.queryEncoding);
    }
    return VK_ORIGIN + '/audios' + currentOwnerId() + '?q=' + encodeQuery(query);
  }

  // Если ID владельца аудио ещё не известен, запоминаем запрос: vk.js на
  // открывшейся странице VK достроит ?q=, если VK потеряет его при редиректе.
  function rememberPendingSearch(query) {
    query = normalizeText(query);
    if (!query) return;
    storageSet('local', {
      pendingAudioSearch: { query: query, ts: Date.now() }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Чтение трека из разметки 1001Tracklists                             */
  /* ------------------------------------------------------------------ */

  /*
   * Лейбл: в строке их бывает несколько (COLUMBIA / ULTRA), берём все
   * `.trackLabel` по порядку. В `meta[itemprop="publisher"]` лежит HTML,
   * поэтому проще читать готовые узлы, чем разбирать строку.
   */
  function readLabel(host) {
    var names = [];
    var seen = {};
    qsa(LABEL_NODE, host).forEach(function (node) {
      var text = normalizeText(node.textContent);
      if (!text) return;
      var key = text.toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      names.push(text);
    });
    return names.join(' / ');
  }

  function readInfo(host) {
    var nameBlock = host.querySelector(NAME_BLOCK);
    var nameMeta = host.querySelector(NAME_META);

    var name = normalizeText(nameMeta && nameMeta.getAttribute('content'));
    var fromMeta = !!name;
    if (!name) name = normalizeText(nameBlock && nameBlock.textContent);
    if (!name) return null;

    // Строка «ID - ID»: meta[name] у неё нет, а подпись помечена красным.
    if (window.TL2VK && typeof window.TL2VK.isUnidentified === 'function') {
      if (window.TL2VK.isUnidentified(name)) return null;
    }
    if (!fromMeta && nameBlock && nameBlock.classList && nameBlock.classList.contains('redTxt')) {
      return null;
    }

    var parsed = (window.TL2VK && typeof window.TL2VK.parseTrackName === 'function')
      ? window.TL2VK.parseTrackName(name)
      : null;
    if (!parsed) return null;
    // Название неизвестно («Dom Dolla - ID») — искать нечего.
    if (!parsed.title || /^id$/i.test(parsed.title)) return null;

    parsed.label = readLabel(host);
    parsed.key = host.getAttribute('data-id') || host.getAttribute('data-trackid') || name;
    parsed.nameBlock = nameBlock;
    parsed.host = host;

    return parsed;
  }

  /* ------------------------------------------------------------------ */
  /* Поисковый запрос                                                    */
  /* ------------------------------------------------------------------ */

  function buildQuery(info) {
    if (window.TL2VK && typeof window.TL2VK.renderQuery === 'function') {
      return window.TL2VK.renderQuery(info, settings);
    }
    return normalizeText([info.artistsText, info.title].filter(Boolean).join(' - '));
  }

  /* ------------------------------------------------------------------ */
  /* Кнопка                                                              */
  /* ------------------------------------------------------------------ */

  function buttonTitle(query) {
    return 'Найти «' + query + '» в аудио VK';
  }

  function stopPropagation(event) {
    event.stopPropagation();
  }

  function onPressStart(event) {
    event.stopPropagation();
    var button = event.currentTarget;
    if (currentOwnerId()) return;
    rememberPendingSearch(button.getAttribute(QUERY_ATTR) || '');
  }

  function onButtonClick(event) {
    var button = event.currentTarget;
    event.stopPropagation();

    var query = normalizeText(button.getAttribute(QUERY_ATTR));
    if (!query) return;

    // ID мог появиться уже после отрисовки кнопки — пересчитываем адрес.
    var url = buildSearchUrl(query);
    if (button.getAttribute('href') !== url) button.setAttribute('href', url);
    if (!currentOwnerId()) rememberPendingSearch(query);

    // openInNewTab = false: ничего не делаем, переход по href откроется в
    // текущей вкладке (target у такой кнопки не выставлен).
  }

  function createButton(info) {
    var query = buildQuery(info);
    if (!query) return null;

    var button = document.createElement('a');
    button.className = BTN_CLASS;
    button.setAttribute(BTN_ATTR, '');
    button.setAttribute('aria-label', buttonTitle(query));
    button.title = buttonTitle(query);
    button.setAttribute(QUERY_ATTR, query);
    button.setAttribute(KEY_ATTR, info.key || query);
    button.innerHTML = ICON_SVG;

    button.addEventListener('mousedown', onPressStart);
    button.addEventListener('pointerdown', onPressStart);
    button.addEventListener('mouseup', stopPropagation);
    button.addEventListener('click', onButtonClick);
    button.addEventListener('auxclick', onPressStart);

    syncButton(button, info);
    return button;
  }

  function syncButton(button, info) {
    var query = buildQuery(info);
    if (!query) return;

    var url = buildSearchUrl(query);
    if (button.getAttribute('href') !== url) button.setAttribute('href', url);

    if (settings.openInNewTab) {
      if (button.getAttribute('target') !== '_blank') button.setAttribute('target', '_blank');
      if (button.getAttribute('rel') !== 'noopener noreferrer') {
        button.setAttribute('rel', 'noopener noreferrer');
      }
    } else {
      if (button.hasAttribute('target')) button.removeAttribute('target');
      if (button.hasAttribute('rel')) button.removeAttribute('rel');
    }

    var title = buttonTitle(query);
    if (button.title !== title) button.title = title;
    if (button.getAttribute('aria-label') !== title) button.setAttribute('aria-label', title);

    if (button.getAttribute(QUERY_ATTR) !== query) button.setAttribute(QUERY_ATTR, query);

    // Ключ тоже обновляем: строку могли перерисовать или скопировать, и
    // старая кнопка досталась уже другому треку.
    var key = info.key || query;
    if (button.getAttribute(KEY_ATTR) !== key) button.setAttribute(KEY_ATTR, key);
  }

  /*
   * Куда физически вставить кнопку: в конец подписи трека (`.trackValue`), то
   * есть сразу после названия и перед лейблом. Если блока подписи нет —
   * в конец блока микроданных или самой строки.
   */
  function insertionPoint(info) {
    if (info.nameBlock) return { parent: info.nameBlock, before: null };

    var content = info.host.querySelector(CONTENT_BLOCK);
    if (content) return { parent: content, before: null };

    return { parent: info.host, before: null };
  }

  /* ------------------------------------------------------------------ */
  /* Разметка страницы                                                   */
  /* ------------------------------------------------------------------ */

  function hosts() {
    var found = [];

    qsa(HOST_SELECTOR).forEach(function (host) {
      // Вложенный контейнер не дублируем: одна кнопка на один трек.
      // Проверяем предка, а не перебор уже найденных — так скан остаётся
      // линейным на длинных страницах (лейбл, артист, подборки).
      var outer = host.parentElement ? host.parentElement.closest(HOST_SELECTOR) : null;
      if (outer) return;
      found.push({ host: host });
    });

    return found;
  }

  function pruneButtons(handled) {
    qsa(BTN_SELECTOR).forEach(function (button) {
      var host = button.closest(HOST_SELECTOR);
      if (!host || handled.indexOf(host) === -1) {
        if (button.parentNode) button.parentNode.removeChild(button);
      }
    });
  }

  function scan() {
    if (scanTimer) {
      clearTimeout(scanTimer);
      scanTimer = null;
    }

    if (!settings.enabled) {
      removeAllButtons();
      return;
    }

    var handled = [];

    hosts().forEach(function (entry) {
      var info = readInfo(entry.host);
      if (!info) return;
      if (!buildQuery(info)) return;

      handled.push(entry.host);

      var button = entry.host.querySelector(BTN_SELECTOR);
      if (button) {
        syncButton(button, info);
        return;
      }

      var point = insertionPoint(info);
      if (!point) return;

      var created = createButton(info);
      if (!created) return;

      if (point.before && point.before.parentNode === point.parent) {
        point.parent.insertBefore(created, point.before);
      } else {
        point.parent.appendChild(created);
      }
    });

    pruneButtons(handled);

    // Отметка для отладки и тестов: сколько раз страница уже просмотрена.
    scans += 1;
    document.documentElement.setAttribute('data-tl2vk-scans', String(scans));
    document.documentElement.classList.add('tl2vk-ready');
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(scan, 250);
  }

  function removeAllButtons() {
    qsa(BTN_SELECTOR).forEach(function (button) {
      if (button.parentNode) button.parentNode.removeChild(button);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Жизненный цикл                                                      */
  /* ------------------------------------------------------------------ */

  function startWatching() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver(function () {
      scheduleScan();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopWatching() {
    if (!observer) return;
    observer.disconnect();
    observer = null;
  }

  function checkRoute() {
    var route = location.pathname + location.search;
    if (route === lastRoute) return;
    lastRoute = route;
    scan();
  }

  function applyEnabledState() {
    document.documentElement.classList.toggle('tl2vk-disabled', !settings.enabled);
    if (settings.enabled) {
      startWatching();
      scheduleScan();
    } else {
      stopWatching();
      removeAllButtons();
    }
  }

  function watchSettings() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) return;
      chrome.storage.onChanged.addListener(function (changes, area) {
        var relevant = false;
        Object.keys(changes || {}).forEach(function (key) {
          if (area === 'sync' && Object.prototype.hasOwnProperty.call(DEFAULTS, key)) relevant = true;
          if (area === 'local' && key === 'detectedAudioOwnerId') relevant = true;
        });
        if (!relevant) return;

        if (area === 'local' && changes.detectedAudioOwnerId) {
          detectedOwnerId = String(changes.detectedAudioOwnerId.newValue || '');
          // ID изменился — обновляем адреса уже нарисованных кнопок.
          qsa(BTN_SELECTOR).forEach(function (button) {
            var query = button.getAttribute(QUERY_ATTR) || '';
            if (!query) return;
            var url = buildSearchUrl(query);
            if (button.getAttribute('href') !== url) button.setAttribute('href', url);
          });
          return;
        }

        applySettings(readSettingsFromChanges(changes));
        applyEnabledState();
        scan();
      });
    } catch (e) { /* ignore */ }
  }

  // Собирает актуальные настройки из события chrome.storage.onChanged.
  function readSettingsFromChanges(changes) {
    var next = Object.assign({}, settings);
    Object.keys(changes || {}).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return;
      next[key] = changes[key].newValue;
    });
    return next;
  }

  function init() {
    lastRoute = location.pathname + location.search;

    storageGet('sync', DEFAULTS, function (values) {
      applySettings(values);
      storageGet('local', { detectedAudioOwnerId: '' }, function (local) {
        detectedOwnerId = String((local && local.detectedAudioOwnerId) || '');
        applyEnabledState();
        scan();

        watchSettings();
        startWatching();

        if (routeTimer) clearInterval(routeTimer);
        routeTimer = setInterval(checkRoute, 900);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
