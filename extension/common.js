/*
 * 1001Tracklists → VK Track Search — общая часть.
 *
 * Здесь лежат значения по умолчанию и единственная реализация того, как из
 * подписи трека на 1001Tracklists получается поисковый запрос и адрес поиска
 * в VK. Файл подключается первым и в content script (content.js / vk.js),
 * и на страницу настроек.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';

  var DEFAULTS = {
    // Включено ли расширение целиком.
    enabled: true,
    // Шаблон поискового запроса. Подстановки: {name}, {artists}, {artist},
    // {mainArtist}, {title}, {mix}, {label}.
    queryTemplate: '{artists} - {title} ({mix})',
    // Открывать поиск VK в новой вкладке.
    openInNewTab: true,
    // VK кодирует параметр поиска дважды: пробел выглядит как %2520.
    queryEncoding: 'double',
    // Ручной ID владельца аудио (число из адреса vk.ru/audios<ID>).
    audioOwnerId: ''
  };

  var VK_ORIGIN = 'https://vk.ru';

  // Разделитель «исполнитель — название»: " - ", " – ", " — ".
  var ARTIST_TITLE_SEPARATOR = /\s+[-\u2013\u2014]\s+/;

  // Разделители между артистами в подписи 1001Tracklists.
  var ARTIST_SPLIT = /\s*(?:&|\+|,|\b(?:vs|ft|feat)\.?(?=\s|$))\s*/i;

  // Хвостовая скобка в названии считается миксом, только если похожа на микс.
  var MIX_TAIL = /^(.*?)\s*\(([^()]*)\)\s*$/;
  var MIX_WORDS = /(remix|remode|rework|refix|edit|mix|bootleg|flip|vip|dub|mashup|blend|acapella|acappella|instrumental|extended|tool)/i;

  function normalizeText(value) {
    return String(value == null ? '' : value)
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /*
   * Разбирает подпись трека 1001Tracklists вида
   *   «Michael Bibi & KETTAMA ft. Wu-Tang Clan - MYSTERY OF RAW»
   *   «Calvin Harris ft. Clementine Douglas - Blessings (KETTAMA Remix)»
   * на артистов, название и микс.
   *
   * Разделитель берётся первый: он отделяет артистов от названия, а дефисы
   * внутри названия остаются на месте. Хвостовая скобка выносится в mix
   * только если она похожа на микс — тогда шаблон по умолчанию собирает
   * подпись обратно без потерь.
   */
  function parseTrackName(value) {
    var name = normalizeText(value);
    if (!name) return null;

    var artistsText = '';
    var title = name;

    var match = ARTIST_TITLE_SEPARATOR.exec(name);
    if (match) {
      artistsText = normalizeText(name.slice(0, match.index));
      title = normalizeText(name.slice(match.index + match[0].length));
    }

    // «ID - Feel The Funk»: исполнитель неизвестен, искать надо по названию.
    if (/^id$/i.test(artistsText)) artistsText = '';

    var artists = artistsText
      ? artistsText.split(ARTIST_SPLIT).map(normalizeText).filter(Boolean)
      : [];

    var mix = '';
    var tail = MIX_TAIL.exec(title);
    if (tail && MIX_WORDS.test(tail[2])) {
      mix = normalizeText(tail[2]);
      title = normalizeText(tail[1]);
    }

    return {
      name: name,
      artistsText: artistsText,
      artists: artists,
      title: title,
      mix: mix
    };
  }

  /*
   * Строка, которую 1001Tracklists показывает вместо трека, когда он не опознан:
   * «ID» или «ID - ID». Такие строки кнопки не получают — искать нечего.
   */
  function isUnidentified(value) {
    // В разметке подпись «ID» склеена из отдельных span-ов, поэтому после
    // textContent получается «ID-» без пробелов — хвостовые разделители срезаем.
    var name = normalizeText(value).replace(/[\s\-\u2013\u2014:,]+$/, '');
    if (!name) return true;
    if (/^id$/i.test(name)) return true;
    if (/^id\s*[-\u2013\u2014]\s*id$/i.test(name)) return true;
    return false;
  }

  /*
   * Собирает поисковый запрос из данных трека.
   * info: { name, artists: [...], artistsText, title, mix, label }
   *
   * {name} — вся подпись как на сайте («A & B - Title (Remix)»), {artists} —
   * только исполнители, {mainArtist} — первый из них.
   */
  function renderQuery(info, options) {
    var opts = options || {};
    var template = normalizeText(opts.queryTemplate) || DEFAULTS.queryTemplate;
    if (template.indexOf('{title}') === -1 && template.indexOf('{name}') === -1) {
      template = DEFAULTS.queryTemplate;
    }

    var data = info || {};
    var artists = Array.isArray(data.artists) ? data.artists : [];
    var allArtists = normalizeText(data.artistsText) || artists.join(', ');
    var mainArtist = artists[0] || allArtists;
    var mix = normalizeText(data.mix);
    var title = normalizeText(data.title);
    var name = normalizeText(data.name) ||
      normalizeText([allArtists, title].filter(Boolean).join(' - '));

    // Микса нет — убираем и скобки вокруг него, чтобы не получить «()».
    if (!mix) template = template.replace(/\s*\(\s*\{mix\}\s*\)/g, '');

    var query = template
      .replace(/\{name\}/g, name)
      .replace(/\{mainArtist\}/g, mainArtist)
      .replace(/\{artist\}/g, allArtists)
      .replace(/\{artists\}/g, allArtists)
      .replace(/\{title\}/g, title)
      .replace(/\{mix\}/g, mix)
      .replace(/\{label\}/g, normalizeText(data.label));

    return normalizeText(query)
      .replace(/\(\s*\)/g, '')
      .replace(/\s+([,;])/g, '$1')
      .replace(/^[\s\-\u2013\u2014:,.]+/, '')
      .replace(/[\s\-\u2013\u2014:,]+$/, '')
      .replace(/\(\s*\)/g, '')
      .trim();
  }

  /*
   * Кодирование параметра q. VK декодирует его дважды, поэтому в адресах,
   * которые генерирует сам сайт, пробел выглядит как %2520.
   */
  function encodeQuery(query, encoding) {
    var once = encodeURIComponent(String(query == null ? '' : query));
    return encoding === 'single' ? once : encodeURIComponent(once);
  }

  /*
   * Адрес страницы музыки с заполненным поиском.
   * ownerId может быть пустым — тогда VK сам подставит ID при редиректе,
   * а vk.js достроит параметр q, если тот потеряется.
   */
  function buildSearchUrl(query, ownerId, encoding) {
    var id = /^\d{1,20}$/.test(String(ownerId || '')) ? String(ownerId) : '';
    return VK_ORIGIN + '/audios' + id + '?q=' + encodeQuery(query, encoding);
  }

  window.TL2VK = window.TL2VK || {};
  window.TL2VK.VERSION = VERSION;
  window.TL2VK.DEFAULTS = DEFAULTS;
  window.TL2VK.VK_ORIGIN = VK_ORIGIN;
  window.TL2VK.normalizeText = normalizeText;
  window.TL2VK.parseTrackName = parseTrackName;
  window.TL2VK.isUnidentified = isUnidentified;
  window.TL2VK.renderQuery = renderQuery;
  window.TL2VK.encodeQuery = encodeQuery;
  window.TL2VK.buildSearchUrl = buildSearchUrl;
})();
