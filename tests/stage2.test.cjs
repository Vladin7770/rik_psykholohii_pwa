'use strict';
// Run with: node tests/stage2.test.cjs
// Browser storage, DOM and timers below are isolated test doubles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const KEY = 'psykholohiia-rik-v1';
const plain = value => JSON.parse(JSON.stringify(value));
new vm.Script(source);

function harness(initial, options = {}) {
  const storage = new Map(initial === undefined ? [] : [[KEY, initial]]);
  const nodes = new Map(), documentEvents = {}, windowEvents = {}, timeouts = new Map();
  let timeoutID = 0;
  const clock = { now: options.now === undefined ? Date.now() : options.now };
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  let resourceNodes = [];
  let context;
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const classes = new Set(), attrs = new Map();
    let content = '';
    const element = {
      id, value: '', textContent: '', dataset: {}, style: {}, hidden: false,
      inert: false, open: false, tagName: 'DIV', disabled: false,
      classList: {
        add: x => classes.add(x), remove: x => classes.delete(x),
        contains: x => classes.has(x),
        toggle(x, force) { const next = force === undefined ? !classes.has(x) : force; if (next) classes.add(x); else classes.delete(x); return next; }
      },
      setAttribute: (k, v) => attrs.set(k, String(v)),
      removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.get(k),
      getClientRects: () => [1],
      scrollIntoView(settings) { element.scrolled = settings; },
      focus() { context.document.activeElement = element; },
      querySelector: selector => selector === '.close-btn' ? node('close') : null,
      querySelectorAll: () => [],
      addEventListener() {}, showModal() { element.open = true; }, close() { element.open = false; }
    };
    Object.defineProperty(element, 'innerHTML', {
      get: () => content,
      set(value) {
        content = value;
        for (const match of value.matchAll(/id="([^"]+)"/g)) node(match[1]);
        for (const match of value.matchAll(/<(?:input|select)\b[^>]*id="([^"]+)"[^>]*>/g)) {
          const attr = match[0].match(/\bvalue="([^"]*)"/);
          if (attr) node(match[1]).value = attr[1];
        }
        if (id === 'main' || id === 'library-list') {
          resourceNodes = [...value.matchAll(/<article\b[^>]*data-resource="([^"]+)"/g)].map(match => {
            const card = node('resource:' + match[1]); card.dataset.resource = match[1]; return card;
          });
        }
      }
    });
    nodes.set(id, element);
    return element;
  }
  ['side', 'main', 'mobile-nav', 'matdlg', 'command-dialog', 'goal-dialog', 'attach-dialog', 'card-dialog', 'recall-dialog', 'app-manifest', 'toast', 'body', 'topbar', 'menu', 'sync'].forEach(node);
  context = {
    document: {
      activeElement: null, visibilityState:'visible', body: node('body'), documentElement:node('html'),
      getElementById: id => nodes.get(id) || null,
      querySelector: selector => selector === '.topbar' ? node('topbar') : selector === '.topbar [data-a="menu"]' ? node('menu') : nodes.get(selector.slice(1)) || null,
      querySelectorAll: selector => selector === '[data-resource]' ? resourceNodes : selector === '.sync' ? [node('sync')] : selector.includes('[data-a="menu"]') ? [node('menu')] : [],
      addEventListener: (type, fn) => (documentEvents[type] ||= []).push(fn)
    },
    localStorage: {
      getItem(k) { if (options.failReads) throw new Error('SecurityError'); return storage.get(k) ?? null; },
      setItem(k, v) { if (options.failWrites === true || options.failWrites === k) throw new Error('QuotaExceededError'); storage.set(k, v); }
    },
    location: { hash: options.hash || '#overview', protocol: 'http:', hostname: 'localhost', reload(){context.reloaded=true} },
    navigator: options.navigator || {}, URL, Date: TestDate,
    setTimeout: (fn,ms) => {const id=++timeoutID;timeouts.set(id,{fn,ms});return id}, clearTimeout(id) {timeouts.delete(id)}, setInterval: () => 1, clearInterval() {},
    matchMedia: query => ({ matches: query.includes('color-scheme') ? !!options.dark : true }), scrollY: 0,
    scrollTo(first, second) { context.lastScroll = typeof first === 'object' ? first : { left: first, top: second }; context.scrollY = +context.lastScroll.top || 0; },
    addEventListener: (type, fn) => (windowEvents[type] ||= []).push(fn),
    FileReader: function () { this.readAsText = file => { this.result = file.text; this.onload(); }; },
    FormData: class { constructor(form) { this.values = form.formValues; } get(key) { return this.values[key] ?? null; } }
  };
  context.window = context;
  vm.createContext(context);
  for(const file of ['content/curriculum.js','content/academic-core.js','content/academic-ui.js'])new vm.Script(fs.readFileSync(path.join(__dirname,'..',file),'utf8')).runInContext(context);
  const instrumented = source.replace(/\}\)\(\);\s*$/, `
    globalThis.api={studySequence,studyHref,studyCandidate,studyOverviewHTML,studyContinueHref,studyCurrent,studyStep,studyAction,captureStudyView,restoreStudyView,vStudy,academic:ACADEMIC_UI,norm,toolDraft,toolDraftKey,writeToolDraft,saveTool,learningDelete,ideaToNote,learningCard,
      vLearningRecords,vResearch,vCases,vConcepts,vCritical,vExperiments,vSessions,readingControlsHTML,moduleExplanationHTML,
      searchNorm,searchNear,searchRank,searchHighlight,executeCommand,renderCommandResults,openCommand,
      criticalChoose,criticalReveal,startLearningSession,finishLearningSession,completeLearningSession,
      startExperiment,experimentNext,stroopAnswer,memoryAnswer,pauseExperiment,experimentSummary,experimentExplanation,
      changeReading,applyReading,focusLearningContext,renderPageNavigation,conceptItems,
      get experiment(){return EXP},get tools(){return LEARN_TOOLS},get criticalTasks(){return CRITICAL_TASKS},
      get commands(){return CMD_ITEMS},get explanations(){return MODULE_EXPLANATIONS},
      setTheme,applyTheme,themeSettingHTML,restoreTimers,focusTick,focusCredit,applyPWAUpdate,hasUnsavedDraft,pwaNoticeHTML,
      get pwaReg(){return PWA_REG},set pwaReg(v){PWA_REG=v},get pwaUpdating(){return PWA_UPDATING},fresh,validateState,decodeBackup,applyBackup,saveLocal,importBackup,
      route,primaryNavHTML,moduleSwitcherHTML,vModules,vLibrary,refreshLib,render,setMenu,
      allResources,seedLearningContent,commandMatches,
      ensureLibrary,legacyResources,upsertMaterial,attachMaterial,setMaterialHidden,resourceCard,
      libraryResults,parseMaterialTags,cleanMaterialURL,youtubeInfo,loadYouTube,
      openMatDialog,openMaterialPicker,handleLibrarySubmit,createBackup,
      get libraryView(){return LIB_VIEW},get librarySelected(){return LIB_SELECTED},
      goalSettings,goalProgress,setDailyGoal,openGoalDialog,studyRhythm,periodSummary,
      rememberModule,rememberResource,resumeTarget,resumeHref,routeMaterial,restoreMaterial,remapBookmark,
      setResourceStatus,preserveCompletion,completionTime,timerCredit,timerTick,timerAction,startShortSession,
      iso,dayNumber,weekDates,refreshStudyDay,focusAction,mutate,
      dueCards,reviewPlan,effectiveReviewStep,currentReviewCard,revealReviewCard,gradeReviewCard,
      createStudyCard,setCardHidden,openCardDialog,saveResourceRecall,showResourceReflection,finishResource,dismissReflection,
      saveModuleView,captureReadingView,restoreReadingView,modulePanelOpen,prepareModuleReading,
      get reviewRevealed(){return CARD_REVEALED},get cardView(){return CARD_VIEW},
      get timer(){return T},get focus(){return F},
      get state(){return S}, get blocked(){return STORAGE_BLOCKED},
      get error(){return STORAGE_ERROR}, armImport:function(){importArmed=1}};
    })();`);
  assert.notEqual(instrumented, source);
  new vm.Script(instrumented).runInContext(context);
  return { api: context.api, context, storage, nodes, documentEvents, windowEvents, clock, timeouts,
    runTimeout(ms) {const pair=[...timeouts].find(([,t])=>t.ms===ms);assert.ok(pair,'scheduled timeout '+ms);timeouts.delete(pair[0]);pair[1].fn()} };
}

function legacyState() {
  return {
    v: 1, start: '2026-11-08', seedVersion: 1, updatedAt: 100,
    topics: { '3-2': true }, notes: { 3: 'Збережена нотатка' }, courseNotes: 'Мій курс',
    materials: { 3: [{ id: 'm-legacy', title: 'Матеріал для перевірки', url: 'https://example.com/reading', type: 'Стаття' }] },
    topicMaterials: { '3-2': [{ id: 't-legacy', title: 'Джерело до теми', url: 'https://example.com/topic', type: 'Книга' }] },
    resourceStates: { 'module-3-m-legacy': { status: 'Вивчаю', note: 'Моя особиста нотатка' }, 'builtin-media-1-0': { status: 'Опрацьовано', note: 'Вбудований ресурс' } },
    cards: [{ id: 'c-legacy', front: 'Запитання', back: 'Відповідь', module: 3, dueAt: 1700000000000, box: 4 }],
    quiz: { 3: [{ id: 'q-legacy', question: 'Питання?', choices: ['Так', 'Ні'], answer: 0 }] },
    days: { '2026-11-07': 45 }, done: { 1: true },
    _legacyMetadata: { keep: 'Зберегти невідомі поля' }
  };
}

const cases = [];
function test(name, run) { run(); cases.push(name); }

test('Normal startup renders the app with a three-tab navigation', () => {
  const h = harness();
  assert.match(h.nodes.get('main').innerHTML, /<h1>Сьогодні<\/h1>/);
  const nav = h.nodes.get('mobile-nav').innerHTML;
  assert.deepEqual([...nav.matchAll(/href="#([^"]+)"/g)].map(x => x[1]), ['overview', 'academic', 'library']);
  assert.equal(h.api.allResources().length, 121);
  assert.equal(h.api.state.cards.length, 120);
});

test('Legacy data, unknown fields and material IDs survive startup unchanged', () => {
  const old = legacyState(), raw = JSON.stringify(old), h = harness(raw);
  for (const key of Object.keys(old)) assert.deepEqual(plain(h.api.state[key]), old[key], key);
  assert.equal(h.storage.get(KEY), raw);
  const ids = h.api.allResources().map(x => x.id);
  assert.ok(ids.includes('module-3-m-legacy'));
  assert.ok(ids.includes('topic-3-2-t-legacy'));
  assert.equal(h.api.state.resourceStates['module-3-m-legacy'].note, 'Моя особиста нотатка');
});

test('Seeding adds content once and preserves existing learning data', () => {
  const old = legacyState(); delete old.seedVersion;
  const h = harness(JSON.stringify(old));
  assert.equal(h.api.state.cards.filter(x => x.id === 'c-legacy').length, 1);
  assert.equal(h.api.state.cards.length, 121);
  assert.equal(h.api.state.notes[3], old.notes[3]);
  const before = JSON.stringify(h.api.state);
  h.api.seedLearningContent(); assert.equal(JSON.stringify(h.api.state), before);
});

test('Corrupt JSON is never overwritten by startup, seeding or later saves', () => {
  const raw = '{broken JSON', h = harness(raw);
  assert.equal(h.api.blocked, true);
  assert.equal(h.storage.get(KEY), raw);
  h.api.state.courseNotes = 'Тимчасова нотатка';
  assert.equal(h.api.saveLocal(), false);
  assert.equal(h.storage.get(KEY), raw);
  assert.match(h.nodes.get('main').innerHTML, /Завантажити оригінал даних/);
});

test('Malformed nested legacy data is preserved instead of silently discarded', () => {
  const old = legacyState(); old.materials[3] = { invalid: 'not an array' };
  const raw = JSON.stringify(old), h = harness(raw);
  assert.equal(h.api.blocked, true);
  assert.equal(h.storage.get(KEY), raw);
});

test('Unavailable storage cannot cause a write over unread data', () => {
  const raw = JSON.stringify(legacyState()), h = harness(raw, { failReads: true });
  assert.equal(h.api.blocked, true);
  assert.equal(h.api.saveLocal(), false);
  assert.equal(h.storage.get(KEY), raw);
});

test('Write failures are visible and leave the saved data intact', () => {
  const raw = JSON.stringify(legacyState()), h = harness(raw, { failWrites: true });
  h.api.state.courseNotes = 'Нова нотатка';
  assert.equal(h.api.saveLocal(), false);
  assert.equal(h.storage.get(KEY), raw);
  assert.ok(h.api.error);
  assert.equal(h.nodes.get('storage-notice').hidden, false);
  assert.equal(h.nodes.get('sync').dataset.s, 'error');
});

test('Unrelated JSON, incompatible versions and malformed entries cannot be imported', () => {
  const h = harness(JSON.stringify(legacyState()));
  const malformed = legacyState(); malformed.cards[0].front = 42;
  for (const raw of ['{}', '{"unrelated":"json"}', '{broken', JSON.stringify({ ...legacyState(), v: 2 }), JSON.stringify(malformed), JSON.stringify({ app: 'Other app', version: 1, state: legacyState() })]) assert.throws(() => h.api.decodeBackup(raw));
});

test('The import UI rejects an unrelated file without changing storage or making a snapshot', () => {
  const raw = JSON.stringify(legacyState()), h = harness(raw);
  h.context.location.hash = '#backup'; h.api.render();
  h.nodes.get('backup-file').files = [{ text: '{"unrelated":"json"}' }];
  h.api.armImport(); h.api.importBackup();
  assert.equal(h.storage.get(KEY), raw);
  assert.equal(h.storage.has(KEY + '-pre-import'), false);
  assert.equal(h.api.state.courseNotes, 'Мій курс');
});

test('Both raw legacy backups and the original version-1 export envelope are accepted', () => {
  const h = harness(), old = legacyState();
  for (const input of [old, { app: 'Рік психології', version: 1, state: old }]) {
    const candidate = h.api.decodeBackup(JSON.stringify(input));
    assert.equal(candidate.courseNotes, old.courseNotes);
    assert.deepEqual(plain(candidate._legacyMetadata), old._legacyMetadata);
  }
});

test('A valid import saves the previous complete state before replacing it', () => {
  const old = legacyState(), h = harness(JSON.stringify(old)), next = legacyState();
  next.courseNotes = 'Відновлений курс';
  assert.equal(h.api.applyBackup(h.api.decodeBackup(JSON.stringify(next))), true);
  assert.equal(h.api.state.courseNotes, 'Відновлений курс');
  assert.equal(JSON.parse(h.storage.get(KEY)).courseNotes, 'Відновлений курс');
  const previous = h.api.decodeBackup(h.storage.get(KEY + '-pre-import'));
  for (const key of Object.keys(old)) assert.deepEqual(plain(previous[key]), old[key], key);
});

test('If either snapshot or final write fails, import leaves the current state intact', () => {
  for (const failedKey of [KEY + '-pre-import', KEY]) {
    const old = legacyState(), raw = JSON.stringify(old), h = harness(raw, { failWrites: failedKey });
    const next = legacyState(); next.courseNotes = 'Інший стан';
    assert.equal(h.api.applyBackup(h.api.decodeBackup(JSON.stringify(next))), false);
    assert.equal(h.api.state.courseNotes, old.courseNotes);
    assert.equal(h.storage.get(KEY), raw);
  }
});

test('Recovery from corrupt storage retains the exact original and unblocks saving', () => {
  const raw = 'damaged original', h = harness(raw);
  assert.equal(h.api.applyBackup(h.api.decodeBackup(JSON.stringify(legacyState()))), true);
  assert.equal(h.storage.get(KEY + '-pre-import'), raw);
  assert.equal(h.api.blocked, false);
  assert.equal(h.api.saveLocal(), true);
});

test('All existing routes and the new modules route render without exceptions', () => {
  const h = harness();
  const routes = ['overview', 'modules', 'week', 'glossary', 'guide', 'library', 'cards', 'cases', 'research', 'concepts', 'calendar', 'backup', 'review', 'achievements', 'analytics', 'focus', ...Array.from({ length: 12 }, (_, i) => 'm' + (i + 1))];
  for (const route of routes) {
    h.context.location.hash = '#' + route;
    assert.equal(h.api.route(), route);
    assert.doesNotThrow(() => h.api.render(), route);
    assert.match(h.nodes.get('main').innerHTML, /<h1[\s>]/, route);
  }
  h.context.location.hash = '#unknown'; assert.equal(h.api.route(), 'overview');
});

test('Each module activates the modules tab and offers twelve direct module links', () => {
  const h = harness();
  for (let n = 1; n <= 12; n++) {
    h.context.location.hash = '#m' + n;
    assert.match(h.api.primaryNavHTML(true), /href="#academic" aria-current="page"/);
    assert.equal([...h.api.moduleSwitcherHTML(n).matchAll(/href="#m\d+"/g)].length, 12);
  }
  assert.equal([...h.api.vModules().matchAll(/class="module-link"/g)].length, 12);
  assert.ok(h.api.commandMatches('Модулі').some(x => x.target === 'modules'));
});

test('Library add action and search filters are present and search works on saved notes', () => {
  const h = harness(JSON.stringify(legacyState()), { hash: '#library' });
  assert.match(h.nodes.get('main').innerHTML, /data-a="mat-new"/);
  for (const id of ['lib-q', 'lib-type', 'lib-status', 'lib-module', 'lib-core', 'lib-sort', 'lib-count']) assert.ok(h.nodes.has(id), id);
  h.nodes.get('lib-q').value = 'Моя особиста нотатка';
  assert.doesNotThrow(() => h.api.refreshLib());
  assert.equal(h.nodes.get('lib-count').textContent, '1 матеріал');
  assert.match(h.nodes.get('library-list').innerHTML, /Матеріал для перевірки/);
  h.nodes.get('lib-q').value = 'Немає такого матеріалу'; h.api.refreshLib();
  assert.equal(h.nodes.get('lib-count').textContent, '0 матеріалів');
});

test('Mobile menu isolates content and Escape returns focus to the menu trigger', () => {
  const h = harness();
  h.api.setMenu(true);
  assert.equal(h.nodes.get('main').inert, true);
  assert.equal(h.nodes.get('mobile-nav').inert, true);
  assert.equal(h.nodes.get('side').getAttribute('aria-modal'), 'true');
  let prevented = false;
  for (const listener of h.documentEvents.keydown) listener({ key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(h.nodes.get('main').inert, false);
  assert.equal(h.nodes.get('side').getAttribute('aria-modal'), undefined);
  assert.equal(h.context.document.activeElement, h.nodes.get('menu'));
});

test('No duplicate function definitions, cloud integration or external font loading remain', () => {
  const names = [...source.matchAll(/function\s+(\w+)\s*\(/g)].map(x => x[1]);
  assert.equal(new Set(names).size, names.length);
  assert.doesNotMatch(source, /claude\.use|initCloud|scheduleSave/);
  assert.doesNotMatch(html, /fonts\.googleapis\.com/);
  assert.match(html, /<html lang="uk">/);
  assert.match(html, /id="mobile-nav" aria-label="Основні розділи"/);
});

module.exports = { passed: cases.length, cases, harness, legacyState };
if (require.main === module) console.log(`${cases.length} checks passed.`);
