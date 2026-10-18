/*
 * Тесты расширения 1001Tracklists → VK Track Search на jsdom.
 *
 * Страницы поднимаются из настоящей разметки 1001Tracklists:
 *
 *   test/fixture.html               — 10 строк треклиста, вырезанных из живой
 *                                     страницы (все варианты подписи, машап и
 *                                     строка «ID - ID»);
 *   test/fixture-other.html         — страница трека, где строки .bItm — это
 *                                     треклисты, а не треки (кнопок быть не должно);
 *   test/reference/tracklist-page.html — полный снимок живой страницы треклиста
 *                                     (38 строк): на нём проверяется, что запрос
 *                                     совпадает с тем, что сам сайт отправляет
 *                                     в поиск Google для каждого трека.
 *
 * Скрипты расширения выполняются в окне jsdom, после чего проверяется
 * получившийся DOM и chrome.storage.
 *
 * Ожидания построены на условиях, а не на фиксированных паузах: content.js
 * пишет на <html> счётчик сканирований data-tl2vk-scans, поэтому тест ждёт
 * «страница пересканирована», а не «прошло 400 мс».
 *
 * Запуск:
 *   node test/run-tests.mjs
 * (jsdom лежит в test/.deps)
 */
import { existsSync, readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEPS = path.join(HERE, '.deps', 'node_modules');
const PNPM_DEPS = path.join(DEPS, '.pnpm', 'node_modules');

if (existsSync(PNPM_DEPS)) {
  process.env.NODE_PATH = PNPM_DEPS;
  Module._initPaths();
}

const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require(path.join(DEPS, 'jsdom'));

const EXTENSION = path.join(HERE, '..', 'extension');
const FIXTURE_HTML = readFileSync(path.join(HERE, 'fixture.html'), 'utf8');
const OTHER_FIXTURE_HTML = readFileSync(path.join(HERE, 'fixture-other.html'), 'utf8');
const REFERENCE_HTML = readFileSync(path.join(HERE, 'reference', 'tracklist-page.html'), 'utf8');
// URL как у настоящей страницы 1001Tracklists: history.pushState и location
// должны вести себя так же, как в браузере (file:// этого не позволяет).
const FIXTURE_URL =
  'https://www.1001tracklists.com/tracklist/tsw7k3t/dom-dolla-kettama-head-trip-united-states-2026-10-11.html';

const SOURCES = {
  common: readFileSync(path.join(EXTENSION, 'common.js'), 'utf8'),
  content: readFileSync(path.join(EXTENSION, 'content.js'), 'utf8'),
  vk: readFileSync(path.join(EXTENSION, 'vk.js'), 'utf8'),
  optionsJs: readFileSync(path.join(EXTENSION, 'options.js'), 'utf8'),
  optionsHtml: readFileSync(path.join(EXTENSION, 'options.html'), 'utf8'),
  manifest: JSON.parse(readFileSync(path.join(EXTENSION, 'manifest.json'), 'utf8')),
};

let checks = 0;
let failures = 0;

function check(name, condition, extra) {
  checks++;
  if (condition) {
    console.log('  ok   ' + name);
  } else {
    failures++;
    console.log('  FAIL ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra) : ''));
  }
}

/* ------------------------------------------------------------------ */
/* Заглушка chrome.storage                                             */
/* ------------------------------------------------------------------ */

function makeChrome(settings, local) {
  const syncStore = Object.assign({}, settings);
  const localStore = Object.assign({}, local);
  const state = {
    syncStore,
    localStore,
    syncWrites: [],
    localWrites: [],
    listeners: [],
    emit(changes, area) {
      state.listeners.forEach((listener) => listener(changes, area));
    },
  };

  function pick(store, defaults) {
    const out = {};
    Object.keys(defaults || {}).forEach((key) => {
      out[key] = Object.prototype.hasOwnProperty.call(store, key) ? store[key] : defaults[key];
    });
    Object.keys(store).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = store[key];
    });
    return out;
  }

  function area(store, writes) {
    return {
      get(defaults, callback) {
        setTimeout(() => callback(pick(store, defaults || {})), 0);
      },
      set(values, callback) {
        Object.assign(store, values);
        writes.push(Object.assign({}, values));
        if (callback) setTimeout(callback, 0);
      },
    };
  }

  const chrome = {
    runtime: { lastError: null, openOptionsPage() {} },
    storage: {
      sync: area(syncStore, state.syncWrites),
      local: area(localStore, state.localWrites),
      onChanged: {
        addListener(listener) {
          state.listeners.push(listener);
        },
      },
    },
  };

  chrome.__state = state;
  return chrome;
}

/* ------------------------------------------------------------------ */
/* Ожидания                                                            */
/* ------------------------------------------------------------------ */

function waitFor(predicate, timeout = 5000, step = 20) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeout;
    (function tick() {
      let value = false;
      try {
        value = predicate();
      } catch (e) {
        value = false;
      }
      if (value) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      setTimeout(tick, step);
    })();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const IGNORED = [
  /Not implemented: navigation/i,
  /Could not parse CSS stylesheet/i,
];

function filterErrors(errors) {
  return errors.filter((message) => !IGNORED.some((re) => re.test(message)));
}

function scanCount(window) {
  return Number(window.document.documentElement.getAttribute('data-tl2vk-scans') || 0);
}

// Любое изменение DOM заставляет расширение перечитать страницу; ждём именно
// этого, а не «сколько-то миллисекунд».
async function afterMutation(window) {
  const before = scanCount(window);
  const marker = window.document.createElement('i');
  marker.setAttribute('data-test-marker', '');
  window.document.body.appendChild(marker);
  return waitFor(() => scanCount(window) > before);
}

/* ------------------------------------------------------------------ */
/* Запуск страниц                                                      */
/* ------------------------------------------------------------------ */

async function boot1001(options = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(String((error && error.message) || error)));

  const dom = new JSDOM(options.fixture || FIXTURE_HTML, {
    url: options.url || FIXTURE_URL,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.chrome = makeChrome(options.settings || {}, options.local || {});
    },
  });

  const { window } = dom;
  window.eval(SOURCES.common);
  window.eval(SOURCES.content);

  const ready = await waitFor(() => scanCount(window) > 0);

  return { dom, window, chrome: window.chrome, errors: filterErrors(errors), ready };
}

async function bootVk(options = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(String((error && error.message) || error)));

  const dom = new JSDOM('<!doctype html><html><body><main id="page"></main></body></html>', {
    url: options.url || 'https://vk.ru/audios123456789',
    runScripts: 'dangerously',
    virtualConsole,
    beforeParse(window) {
      window.chrome = makeChrome(options.settings || {}, options.local || {});
      window.__repairs = [];
      window.document.addEventListener('tl2vk:repair', (event) => {
        window.__repairs.push(event.detail && event.detail.url);
      });
    },
  });

  const { window } = dom;
  window.eval(SOURCES.common);
  window.eval(SOURCES.vk);

  // Даём скрипту прочитать настройки и разобрать отложенный запрос.
  await waitFor(() => window.chrome.__state.localWrites.length > 0 ||
    window.__repairs.length > 0, 3000);
  await sleep(80);

  return { dom, window, chrome: window.chrome, errors: filterErrors(errors) };
}

async function bootOptions(options = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(String((error && error.message) || error)));

  const dom = new JSDOM(SOURCES.optionsHtml, {
    url: pathToFileURL(path.join(EXTENSION, 'options.html')).href,
    runScripts: 'dangerously',
    virtualConsole,
    beforeParse(window) {
      window.chrome = makeChrome(options.settings || {}, options.local || {});
    },
  });

  const { window } = dom;
  window.eval(SOURCES.common);
  window.eval(SOURCES.optionsJs);

  await waitFor(() => {
    const node = window.document.getElementById('previewUrl');
    return !!node && node.textContent.indexOf('https://vk.ru/audios') === 0;
  });

  return { dom, window, chrome: window.chrome, errors: filterErrors(errors) };
}

/* ------------------------------------------------------------------ */
/* Помощники для проверок                                              */
/* ------------------------------------------------------------------ */

function buttons(window, scope) {
  const root = scope ? window.document.querySelector(scope) : window.document;
  if (!root) return [];
  return Array.from(root.querySelectorAll('a.tl2vk-btn'));
}

function queries(window, scope) {
  return buttons(window, scope).map((button) => button.getAttribute('data-tl2vk-query'));
}

function rowOf(button) {
  return button.closest('div.tlpItem') || button.closest('div.bItm');
}

/*
 * 1001Tracklists сама собирает ссылку «поиск в Google» из той же подписи
 * трека. Это независимый эталон запроса: расширение должно получить ровно
 * такую же строку.
 */
function siteGoogleQuery(row) {
  const link = row.querySelector('a[href^="https://www.google.com/search?q="]');
  if (!link) return null;
  const href = link.getAttribute('href');
  const raw = href.slice(href.indexOf('?q=') + 3);
  const plusDecoded = raw.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(plusDecoded);
  } catch (e) {
    return plusDecoded;
  }
}

function queryByRowId(window, dataId) {
  const button = buttons(window).find((node) => node.getAttribute('data-tl2vk-key') === dataId);
  return button ? button.getAttribute('data-tl2vk-query') : null;
}

function buttonByRowId(window, dataId) {
  return buttons(window).find((node) => node.getAttribute('data-tl2vk-key') === dataId) || null;
}

function expectedUrl(query, ownerId = '') {
  return 'https://vk.ru/audios' + ownerId + '?q=' + encodeURIComponent(encodeURIComponent(query));
}

/* ------------------------------------------------------------------ */
/* Тесты                                                               */
/* ------------------------------------------------------------------ */

async function testLayoutAndDefaults() {
  console.log('\n[1] Разметка треклиста и запрос по умолчанию');
  const { dom, window, errors, ready } = await boot1001();

  check('страница поднялась без ошибок', errors.length === 0, errors);
  check('content script просканировал страницу', ready === true);

  const rows = window.document.querySelectorAll('div.tlpItem');
  check('в фикстуре 10 строк треклиста', rows.length === 10, rows.length);
  check('кнопки получили 9 треков из 10', buttons(window).length === 9, buttons(window).length);
  check(
    'строка «ID - ID» кнопки не получила',
    queryByRowId(window, '14587702') === null,
    queryByRowId(window, '14587702')
  );

  check(
    'три артиста через & сохраняются как на сайте',
    queryByRowId(window, '14587689') === 'Dom Dolla & Solomun & Skepta - DANGER DANGER',
    queryByRowId(window, '14587689')
  );
  check(
    '«ft.» остаётся в подписи',
    queryByRowId(window, '14587690') === 'Michael Bibi & KETTAMA ft. Wu-Tang Clan - MYSTERY OF RAW',
    queryByRowId(window, '14587690')
  );
  check(
    'два артиста без микса — без пустых скобок',
    queryByRowId(window, '14587691') === 'MK & Dom Dolla - Rhyme Dust',
    queryByRowId(window, '14587691')
  );
  check(
    'микс в скобках остаётся на месте',
    queryByRowId(window, '14587692') === 'Calvin Harris ft. Clementine Douglas - Blessings (KETTAMA Remix)',
    queryByRowId(window, '14587692')
  );
  check(
    'спецсимволы в названии (girl$) не портятся',
    queryByRowId(window, '14587694') === 'Dom Dolla - girl$ (Layton Giordani Remix)',
    queryByRowId(window, '14587694')
  );
  check(
    'машап ищется по всей подписи',
    queryByRowId(window, '14587697') ===
      'Dom Dolla & Daya & Anyma vs. Riordan - Dreamin vs. Feel The Funk (Dom Dolla Edit)',
    queryByRowId(window, '14587697')
  );
  check(
    'подстрока машапа получает свою кнопку',
    queryByRowId(window, '14587722') === 'Riordan - Feel The Funk',
    queryByRowId(window, '14587722')
  );
  check(
    'микс «Sunset Ibiza Mix» сохраняется',
    queryByRowId(window, '14587699') === 'KETTAMA - Pretty Green Eyes (Sunset Ibiza Mix)',
    queryByRowId(window, '14587699')
  );
  check(
    'ремикс от двух артистов в скобках сохраняется',
    queryByRowId(window, '14587700') ===
      'Da Hool - Meet Her At The Love Parade (Dom Dolla & Torren Foot Remix)',
    queryByRowId(window, '14587700')
  );

  // Запрос должен совпасть с тем, что сайт сам отправляет в Google.
  const mismatches = [];
  buttons(window).forEach((button) => {
    const row = rowOf(button);
    const reference = row && siteGoogleQuery(row);
    if (!reference) return;
    if (reference !== button.getAttribute('data-tl2vk-query')) {
      mismatches.push([button.getAttribute('data-tl2vk-query'), reference]);
    }
  });
  check('запрос совпадает с поиском сайта по Google', mismatches.length === 0, mismatches.slice(0, 3));

  const first = buttonByRowId(window, '14587689');
  check(
    'ссылка без известного ID ведёт на /audios?q=',
    first.getAttribute('href') ===
      'https://vk.ru/audios?q=Dom%2520Dolla%2520%2526%2520Solomun%2520%2526%2520Skepta%2520-%2520DANGER%2520DANGER',
    first.getAttribute('href')
  );
  check(
    'подсказка содержит запрос',
    first.getAttribute('title') === 'Найти «Dom Dolla & Solomun & Skepta - DANGER DANGER» в аудио VK',
    first.getAttribute('title')
  );
  check('aria-label совпадает с подсказкой', first.getAttribute('aria-label') === first.getAttribute('title'));
  check('ссылка открывается в новой вкладке', first.getAttribute('target') === '_blank');
  check('rel=noopener noreferrer', first.getAttribute('rel') === 'noopener noreferrer');
  check(
    'ключ кнопки — data-id строки',
    first.getAttribute('data-tl2vk-key') === '14587689',
    first.getAttribute('data-tl2vk-key')
  );

  // Позиция: в самом конце подписи трека, перед лейблом.
  const nameBlock = first.parentElement;
  check(
    'кнопка стоит внутри .trackValue',
    !!nameBlock && /trackValue/.test(nameBlock.className),
    nameBlock && nameBlock.className
  );
  check(
    'кнопка — последний элемент подписи',
    nameBlock.lastElementChild === first,
    nameBlock.lastElementChild && nameBlock.lastElementChild.tagName
  );
  const label = first.parentElement.parentElement.querySelector('.trackLabel');
  check(
    'лейбл остаётся после кнопки',
    !!label && label.textContent.trim() === 'THREE SIX ZERO',
    label && label.textContent
  );

  const scansBefore = scanCount(window);
  await afterMutation(window);
  check('повторное сканирование не дублирует кнопки', buttons(window).length === 9, buttons(window).length);
  check('счётчик сканирований растёт', scanCount(window) > scansBefore, scanCount(window));

  dom.window.close();
}

async function testQueryTemplates() {
  console.log('\n[2] Шаблон запроса');
  {
    const { dom, window } = await boot1001({ settings: { queryTemplate: '{name}' } });
    check(
      '{name} — вся подпись как на сайте',
      queryByRowId(window, '14587689') === 'Dom Dolla & Solomun & Skepta - DANGER DANGER',
      queryByRowId(window, '14587689')
    );
    check(
      '{name} без микса не добавляет скобок',
      queryByRowId(window, '14587691') === 'MK & Dom Dolla - Rhyme Dust',
      queryByRowId(window, '14587691')
    );
    dom.window.close();
  }
  {
    const { dom, window } = await boot1001({ settings: { queryTemplate: '{mainArtist} - {title} ({mix})' } });
    check(
      '{mainArtist} — только первый исполнитель',
      queryByRowId(window, '14587689') === 'Dom Dolla - DANGER DANGER',
      queryByRowId(window, '14587689')
    );
    check(
      'микс при этом не теряется',
      queryByRowId(window, '14587692') === 'Calvin Harris - Blessings (KETTAMA Remix)',
      queryByRowId(window, '14587692')
    );
    dom.window.close();
  }
  {
    const { dom, window } = await boot1001({ settings: { queryTemplate: '{title} {artists}' } });
    check(
      'обратный порядок',
      queryByRowId(window, '14587692') === 'Blessings Calvin Harris ft. Clementine Douglas',
      queryByRowId(window, '14587692')
    );
    dom.window.close();
  }
  {
    const { dom, window } = await boot1001({ settings: { queryTemplate: '{artists} - {title} ({mix}) [{label}]' } });
    check(
      'метка лейбла подставляется, два лейбла — через «/»',
      queryByRowId(window, '14587691') === 'MK & Dom Dolla - Rhyme Dust [COLUMBIA / ULTRA]',
      queryByRowId(window, '14587691')
    );
    dom.window.close();
  }
  {
    const { dom, window } = await boot1001({ settings: { queryTemplate: '{artist} - {title}' } });
    check(
      'старый токен {artist} работает как {artists}',
      queryByRowId(window, '14587689') === 'Dom Dolla & Solomun & Skepta - DANGER DANGER',
      queryByRowId(window, '14587689')
    );
    dom.window.close();
  }
  {
    const { dom, window } = await boot1001({ settings: { queryTemplate: 'без подстановки' } });
    check(
      'шаблон без {title} откатывается к значению по умолчанию',
      queryByRowId(window, '14587692') === 'Calvin Harris ft. Clementine Douglas - Blessings (KETTAMA Remix)',
      queryByRowId(window, '14587692')
    );
    dom.window.close();
  }
}

async function testOwnerIdAndEncoding() {
  console.log('\n[3] ID владельца аудио и кодирование');
  {
    const { dom, window } = await boot1001({ local: { detectedAudioOwnerId: '123456789' } });
    const href = buttonByRowId(window, '14587691').getAttribute('href');
    check(
      'ID из storage.local подставляется в адрес',
      href === expectedUrl('MK & Dom Dolla - Rhyme Dust', '123456789'),
      href
    );
    dom.window.close();
  }
  {
    const { dom, window } = await boot1001({
      local: { detectedAudioOwnerId: '123456789' },
      settings: { audioOwnerId: '987654321' },
    });
    const href = buttonByRowId(window, '14587691').getAttribute('href');
    check('ручной ID из настроек важнее выученного', href.indexOf('/audios987654321?q=') !== -1, href);
    dom.window.close();
  }
  {
    const { dom, window } = await boot1001({ settings: { queryEncoding: 'single' } });
    const href = buttonByRowId(window, '14587691').getAttribute('href');
    check(
      'одинарное кодирование даёт %20',
      href === 'https://vk.ru/audios?q=MK%20%26%20Dom%20Dolla%20-%20Rhyme%20Dust',
      href
    );
    dom.window.close();
  }
  {
    const { dom, window } = await boot1001({ settings: { audioOwnerId: 'не число' } });
    const href = buttonByRowId(window, '14587691').getAttribute('href');
    check('нечисловой ID игнорируется', href === expectedUrl('MK & Dom Dolla - Rhyme Dust'), href);
    dom.window.close();
  }
}

async function testBehavior() {
  console.log('\n[4] Поведение кнопки и реакция на настройки');
  {
    const { dom, window, chrome } = await boot1001();

    // Нажатие кнопки не должно всплывать до обработчиков 1001Tracklists
    // (у строки свой onclick="rowToggle(...)").
    let rowClicked = false;
    window.document.querySelector('#tlpTogTable').addEventListener('click', () => {
      rowClicked = true;
    });
    let rowPressed = false;
    window.document.querySelector('#tlpTogTable').addEventListener('mousedown', () => {
      rowPressed = true;
    });

    const button = buttonByRowId(window, '14587691');
    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('клик по кнопке не всплывает до строки треклиста', rowClicked === false);

    button.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    check('mousedown тоже не всплывает', rowPressed === false);

    // Нет ID — запрос запоминается для вкладки VK.
    const pending = chrome.__state.localWrites.filter((write) => write.pendingAudioSearch).pop();
    check(
      'без ID нажатие запоминает отложенный запрос',
      !!pending && pending.pendingAudioSearch.query === 'MK & Dom Dolla - Rhyme Dust',
      chrome.__state.localWrites
    );

    // Появился ID — кнопки обновляют адрес, а запоминать больше не нужно.
    chrome.__state.emit({ detectedAudioOwnerId: { newValue: '555000111' } }, 'local');
    check(
      'новый ID сразу попадает в адрес кнопок',
      buttonByRowId(window, '14587691').getAttribute('href').indexOf('/audios555000111?q=') !== -1,
      buttonByRowId(window, '14587691').getAttribute('href')
    );

    const writesBefore = chrome.__state.localWrites.length;
    buttonByRowId(window, '14587691').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    check('с известным ID отложенный запрос не пишется', chrome.__state.localWrites.length === writesBefore);

    // Смена шаблона через storage.onChanged перерисовывает запросы.
    chrome.__state.emit({ queryTemplate: { newValue: '{name}' } }, 'sync');
    check(
      'смена шаблона обновляет запрос на месте',
      queryByRowId(window, '14587691') === 'MK & Dom Dolla - Rhyme Dust',
      queryByRowId(window, '14587691')
    );
    check('количество кнопок при этом не меняется', buttons(window).length === 9, buttons(window).length);

    // Выключение расширения убирает кнопки, включение — возвращает.
    chrome.__state.emit({ enabled: { newValue: false } }, 'sync');
    check('выключение убирает все кнопки', buttons(window).length === 0, buttons(window).length);
    check('на <html> появляется класс отключения', window.document.documentElement.classList.contains('tl2vk-disabled'));

    chrome.__state.emit({ enabled: { newValue: true } }, 'sync');
    check('включение возвращает кнопки', buttons(window).length === 9, buttons(window).length);

    dom.window.close();
  }
  {
    const { dom, window } = await boot1001({ settings: { openInNewTab: false } });
    const button = buttonByRowId(window, '14587691');
    check('openInNewTab=false: без target', button.getAttribute('target') === null, button.getAttribute('target'));
    check('openInNewTab=false: без rel', button.getAttribute('rel') === null, button.getAttribute('rel'));
    dom.window.close();
  }
}

async function testDynamicPage() {
  console.log('\n[5] Перерисовка страницы');
  const { dom, window } = await boot1001();

  const table = window.document.getElementById('tlpTogTable');
  const firstRow = table.querySelector('div.tlpItem');
  firstRow.parentNode.removeChild(firstRow);
  await afterMutation(window);
  check('удаление строки убирает кнопку', buttons(window).length === 8, buttons(window).length);

  const template = table.querySelector('div.tlpItem').cloneNode(true);
  template.setAttribute('data-id', '99999999');
  template.removeAttribute('id');
  table.appendChild(template);
  await afterMutation(window);
  check('новая строка получает кнопку', buttons(window).length === 9, buttons(window).length);
  check(
    'у клона свой ключ',
    !!buttonByRowId(window, '99999999'),
    buttons(window).map((node) => node.getAttribute('data-tl2vk-key'))
  );

  const scansBefore = scanCount(window);
  window.history.pushState({}, '', '/tracklist/abc1234/other-dj-other-show-2026-01-01.html');
  const rescanned = await waitFor(() => scanCount(window) > scansBefore, 5000);
  check('после смены адреса страница пересканирована', rescanned === true, scanCount(window));
  check('после смены адреса кнопки не дублируются', buttons(window).length === 9, buttons(window).length);

  dom.window.close();
}

async function testPageWithoutTracks() {
  console.log('\n[6] Страница без треков (строки .bItm — это треклисты)');
  const { dom, window, errors } = await boot1001({
    fixture: OTHER_FIXTURE_HTML,
    url: 'https://www.1001tracklists.com/track/107znkyx/m.j.e-michael-chodo-i-am-a-g/index.html',
  });

  check('страница поднялась без ошибок', errors.length === 0, errors);
  check(
    'строки .bItm на странице есть',
    window.document.querySelectorAll('div.bItm').length === 3,
    window.document.querySelectorAll('div.bItm').length
  );
  check('ни одной кнопки не добавлено', buttons(window).length === 0, buttons(window).length);

  dom.window.close();
}

async function testReferencePage() {
  console.log('\n[7] Полная живая страница треклиста');
  const { dom, window, errors } = await boot1001({ fixture: REFERENCE_HTML });

  check('страница поднялась без ошибок', errors.length === 0, errors);
  check('в треклисте 38 строк', window.document.querySelectorAll('div.tlpItem').length === 38,
    window.document.querySelectorAll('div.tlpItem').length);
  check('кнопки получили 37 треков (одна строка — «ID - ID»)', buttons(window).length === 37, buttons(window).length);

  const mismatches = [];
  buttons(window).forEach((button) => {
    const row = rowOf(button);
    const reference = row && siteGoogleQuery(row);
    if (reference && reference !== button.getAttribute('data-tl2vk-query')) {
      mismatches.push([button.getAttribute('data-tl2vk-query'), reference]);
    }
  });
  check('у всех 37 треков запрос совпадает с поиском сайта по Google', mismatches.length === 0,
    mismatches.slice(0, 3));

  check(
    'строка «ID - ID» пропущена',
    buttons(window).every((node) => node.getAttribute('data-tl2vk-key') !== '14587702'),
    buttons(window).map((node) => node.getAttribute('data-tl2vk-key'))
  );
  check(
    'каждый трек получил ровно одну кнопку',
    new Set(buttons(window).map((node) => node.getAttribute('data-tl2vk-key'))).size === 37,
    buttons(window).length
  );

  dom.window.close();
}

async function testVkSide() {
  console.log('\n[8] Скрипт на стороне VK');
  {
    const { dom, window, chrome } = await bootVk({ url: 'https://vk.ru/audios123456789' });
    check(
      'ID владельца аудио выучен из адреса',
      chrome.__state.localStore.detectedAudioOwnerId === '123456789',
      chrome.__state.localStore.detectedAudioOwnerId
    );
    check('без отложенного запроса переходов нет', window.__repairs.length === 0, window.__repairs);
    dom.window.close();
  }
  {
    const { dom, window, chrome } = await bootVk({
      url: 'https://vk.ru/audios123456789',
      local: { pendingAudioSearch: { query: 'MK & Dom Dolla - Rhyme Dust', ts: Date.now() } },
    });
    check(
      'потерянный q достраивается в адресе',
      window.__repairs[0] === 'https://vk.ru/audios123456789?q=MK%2520%2526%2520Dom%2520Dolla%2520-%2520Rhyme%2520Dust',
      window.__repairs
    );
    check('отложенный запрос стирается', !chrome.__state.localStore.pendingAudioSearch, chrome.__state.localStore);
    dom.window.close();
  }
  {
    const { dom, window } = await bootVk({
      url: 'https://vk.ru/audios123456789?q=MK%2520-%2520Rhyme%2520Dust',
      local: { pendingAudioSearch: { query: 'MK - Rhyme Dust', ts: Date.now() } },
    });
    check('если q доехал сам — переход не повторяется', window.__repairs.length === 0, window.__repairs);
    dom.window.close();
  }
  {
    const { dom, window } = await bootVk({
      url: 'https://vk.ru/audios123456789',
      local: { pendingAudioSearch: { query: 'MK - Rhyme Dust', ts: Date.now() - 5 * 60 * 1000 } },
    });
    check('просроченный запрос игнорируется', window.__repairs.length === 0, window.__repairs);
    dom.window.close();
  }
  {
    const { dom, window } = await bootVk({
      url: 'https://vk.ru/audios123456789',
      settings: { queryEncoding: 'single' },
      local: { pendingAudioSearch: { query: 'MK - Rhyme Dust', ts: Date.now() } },
    });
    check(
      'одинарное кодирование в переходе',
      window.__repairs[0] === 'https://vk.ru/audios123456789?q=MK%20-%20Rhyme%20Dust',
      window.__repairs
    );
    dom.window.close();
  }
}

async function testOptions() {
  console.log('\n[9] Страница настроек');
  const { dom, window, chrome, errors } = await bootOptions({
    settings: { queryTemplate: '{mainArtist} - {title} ({mix})', openInNewTab: false, queryEncoding: 'single' },
    local: { detectedAudioOwnerId: '123456789' },
  });

  check('страница настроек без ошибок', errors.length === 0, errors);

  const doc = window.document;
  check('версия показана', doc.getElementById('version').textContent === SOURCES.manifest.version);
  check('шаблон загружен из настроек', doc.getElementById('queryTemplate').value === '{mainArtist} - {title} ({mix})');
  check('переключатель новой вкладки выключен', doc.getElementById('openInNewTab').checked === false);
  check('кодирование из настроек', doc.getElementById('queryEncoding').value === 'single');
  check(
    'предпросмотр ссылки с выученным ID',
    doc.getElementById('previewUrl').textContent.indexOf('https://vk.ru/audios123456789?q=') === 0,
    doc.getElementById('previewUrl').textContent
  );
  check(
    'определённый ID показан текстом',
    /123456789/.test(doc.getElementById('detected').textContent),
    doc.getElementById('detected').textContent
  );
  check(
    'пример для предпросмотра взят из 1001Tracklists',
    doc.getElementById('preview').textContent.indexOf('Calvin Harris - Blessings (KETTAMA Remix)') !== -1,
    doc.getElementById('preview').textContent
  );

  const template = doc.getElementById('queryTemplate');
  template.value = '{name}';
  template.dispatchEvent(new window.Event('input', { bubbles: true }));
  check(
    'предпросмотр реагирует на шаблон',
    doc.getElementById('preview').textContent.indexOf(
      'Calvin Harris ft. Clementine Douglas - Blessings (KETTAMA Remix)'
    ) !== -1,
    doc.getElementById('preview').textContent
  );

  const chip = Array.from(doc.querySelectorAll('#presets .chip')).find(
    (node) => node.getAttribute('data-template') === '{artists} - {title} ({mix})'
  );
  chip.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('кнопка-пресет подставляет шаблон', template.value === '{artists} - {title} ({mix})', template.value);
  check('выбранный пресет подсвечен', chip.classList.contains('active'));

  const saved = await waitFor(
    () => chrome.__state.syncWrites.some((write) => write.queryTemplate === '{artists} - {title} ({mix})'),
    3000
  );
  check('изменения сохраняются в chrome.storage.sync', saved === true, chrome.__state.syncWrites);

  doc.getElementById('reset').click();
  check('сброс возвращает шаблон по умолчанию', template.value === '{artists} - {title} ({mix})', template.value);
  const resetWritten = await waitFor(() => {
    const last = chrome.__state.syncWrites[chrome.__state.syncWrites.length - 1];
    return !!last && last.queryTemplate === '{artists} - {title} ({mix})';
  }, 3000);
  check('сброс записывает значения по умолчанию', resetWritten === true, chrome.__state.syncWrites);

  dom.window.close();
}

function testManifest() {
  console.log('\n[10] Манифест');
  const manifest = SOURCES.manifest;

  check('Manifest V3', manifest.manifest_version === 3, manifest.manifest_version);
  check('версия манифеста совпадает с common.js', manifest.version === '1.0.0', manifest.version);
  check('есть разрешение storage', (manifest.permissions || []).includes('storage'), manifest.permissions);

  const scripts = manifest.content_scripts || [];
  const site = scripts.find((entry) => entry.matches.some((match) => match.indexOf('1001tracklists.com') !== -1));
  const vk = scripts.find((entry) => entry.matches.some((match) => match.indexOf('vk.ru') !== -1));

  check('content script на 1001Tracklists есть', !!site);
  check('порядок: common.js, затем content.js', !!site && site.js.join(',') === 'common.js,content.js', site && site.js);
  check('стили кнопки подключены на 1001Tracklists', !!site && (site.css || []).includes('content.css'));
  check(
    'поддомены 1001tracklists покрыты',
    !!site && site.matches.includes('https://*.1001tracklists.com/*'),
    site && site.matches
  );
  check('content script на VK есть', !!vk);
  check('на VK грузятся common.js и vk.js', !!vk && vk.js.join(',') === 'common.js,vk.js', vk && vk.js);
  check('страница настроек открывается в отдельной вкладке', !!manifest.options_ui && manifest.options_ui.open_in_tab === true);
  check('есть фоновая служба', !!manifest.background && !!manifest.background.service_worker);
  check('иконки 16/32/48/128 на месте', ['16', '32', '48', '128'].every((size) => manifest.icons[size]));
  check(
    'хост-разрешения включают VK',
    (manifest.host_permissions || []).some((host) => host.indexOf('vk.ru') !== -1),
    manifest.host_permissions
  );
}

async function main() {
  await testLayoutAndDefaults();
  await testQueryTemplates();
  await testOwnerIdAndEncoding();
  await testBehavior();
  await testDynamicPage();
  await testPageWithoutTracks();
  await testReferencePage();
  await testVkSide();
  await testOptions();
  testManifest();

  console.log('\n' + (failures === 0 ? 'ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : 'ЕСТЬ ОШИБКИ') + ': ' + (checks - failures) + '/' + checks);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
