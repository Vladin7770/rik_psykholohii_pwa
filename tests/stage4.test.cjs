'use strict';
// Run with: node tests/stage4.test.cjs
// Includes the earlier compatibility, storage-protection and Today checks.
const assert = require('node:assert/strict');
const previous = require('./stage3.test.cjs');
const { harness, legacyState } = require('./stage2.test.cjs');
const KEY = 'psykholohiia-rik-v1';
const NOW = new Date(2026, 10, 8, 12).getTime();
const plain = x => JSON.parse(JSON.stringify(x));
const cases = [];
function test(name, run) { run(); cases.push(name); }
function setup(extra = {}, options = {}) { return harness(JSON.stringify(Object.assign(legacyState(), extra)), { now: NOW, hash: '#library', ...options }); }
function action(h, name, extra = {}) {
  const target = { id: '', dataset: { a: name, ...extra }, textContent: '' };
  target.closest = () => target;
  for (const fn of h.documentEvents.click) fn({ target, preventDefault() {} });
}
function change(h, target) { for (const fn of h.documentEvents.change) fn({ target }); }
function add(h, data = {}) { return h.api.upsertMaterial({ title: 'Новий матеріал', url: 'https://example.com/new', ...data }); }

test('Migration builds a separate catalog without changing legacy IDs, notes or archived arrays', () => {
  const old = legacyState(), raw = JSON.stringify(old), h = setup();
  assert.equal(h.api.state.libraryVersion, 1);
  assert.equal(Object.keys(h.api.state.library).length, 123);
  assert.equal(h.api.state.library['module-3-m-legacy'].module, 3);
  assert.equal(h.api.state.library['topic-3-2-t-legacy'].topicKey, '3-2');
  assert.equal(h.api.state.resourceStates['module-3-m-legacy'].note, 'Моя особиста нотатка');
  for (const key of Object.keys(old)) assert.deepEqual(plain(h.api.state[key]), old[key], key);
  assert.equal(h.storage.get(KEY), raw, 'Reading an old state must not overwrite it');
  const once = JSON.stringify(h.api.state);
  assert.equal(h.api.ensureLibrary(h.api.state), false);
  assert.equal(JSON.stringify(h.api.state), once);
});

test('Duplicate legacy IDs preserve both records and their shared notes', () => {
  const old = legacyState();
  old.materials[3].push({ id: 'm-legacy', title: 'Другий запис з тим самим ID', url: 'https://example.com/second', type: 'Книга' });
  const h = harness(JSON.stringify(old), { now: NOW });
  assert.equal(Object.keys(h.api.state.library).length, 124);
  assert.equal(h.api.state.library['module-3-m-legacy'].title, 'Матеріал для перевірки');
  assert.equal(h.api.state.library['module-3-m-legacy~legacy-2'].title, 'Другий запис з тим самим ID');
  assert.equal(h.api.state.resourceStates['module-3-m-legacy~legacy-2'].note, 'Моя особиста нотатка');
  assert.equal(h.api.state.materials[3].length, 2);
});

test('Old records outside the configured module keys remain available in the inbox', () => {
  const old = legacyState();
  old.materials[0] = [{ id: 'orphan', title: 'Нерозібрана книга', url: 'https://example.com/book', type: 'Книга' }];
  old.topicMaterials['99-100'] = [{ id: 'topic-orphan', title: 'Незвична тема', url: 'https://example.com/orphan', type: 'Стаття' }];
  const h = harness(JSON.stringify(old), { now: NOW });
  assert.equal(h.api.state.library['module-0-orphan'].module, 0);
  assert.equal(h.api.state.library['topic-99-100-topic-orphan'].module, 0);
  assert.deepEqual(plain(h.api.state.topicMaterials['99-100']), old.topicMaterials['99-100']);
});

test('New materials need only a title and link and default to the inbox', () => {
  const h = setup(), oldArchive = JSON.stringify(h.api.state.materials), record = add(h);
  assert.equal(record.module, 0); assert.equal(record.topicKey, '');
  assert.deepEqual(plain(record.tags), []);
  assert.equal(h.api.state.resourceStates[record.id].status, 'Заплановано');
  assert.equal(h.api.state.act['2026-11-08'], undefined);
  assert.equal(JSON.stringify(h.api.state.materials), oldArchive);
  assert.equal(JSON.parse(h.storage.get(KEY)).library[record.id].title, record.title);
});

test('Quick-add submit saves the entry, clears the form and keeps existing search filters', () => {
  const h = setup();
  h.nodes.get('lib-q').value = 'особиста'; h.api.refreshLib();
  let cleared = false;
  const form = { id: 'library-quick-add', dataset: {}, formValues: { title: 'Збережене відео', url: 'https://youtu.be/ATiaILMoLw0' }, reset() { cleared = true; } };
  let prevented = false;
  for (const fn of h.documentEvents.submit) fn({ target: form, preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(cleared, true);
  assert.equal(h.api.libraryView.q, 'особиста');
  const saved = h.api.allResources().find(r => r.title === 'Збережене відео');
  assert.equal(saved.module, 0); assert.equal(saved.type, 'Відео');
  assert.match(h.nodes.get('quick-added').innerHTML, /Збережено у Вхідні/);
  assert.equal(h.context.document.activeElement.id, 'quick-url');
});

test('Invalid links or missing titles do not create partial records', () => {
  const h = setup(), before = JSON.stringify(h.api.state);
  for (const data of [{ title: '', url: 'https://example.com' }, { title: 'x', url: '' }, { title: 'x', url: 'javascript:alert(1)' }, { title: 'x', url: 'data:text/html,x' }, { title: 'x', url: 'не посилання' }]) assert.throws(() => h.api.upsertMaterial(data));
  assert.equal(JSON.stringify(h.api.state), before);
  assert.equal(h.api.cleanMaterialURL('example.com/reading'), 'https://example.com/reading');
});

test('Attaching, changing module and detaching preserve the canonical ID and all notes', () => {
  const h = setup(), id = 'module-3-m-legacy'; h.api.rememberResource(id);
  assert.equal(h.api.attachMaterial(id, 7, '7-1'), true);
  assert.equal(h.api.state.library[id].id, id);
  assert.equal(h.api.state.library[id].module, 7);
  assert.equal(h.api.state.moduleBookmarks[3], undefined);
  assert.equal(h.api.state.moduleBookmarks[7], id);
  assert.equal(h.api.state.studyResume.module, 7);
  assert.equal(h.api.state.resourceStates[id].note, 'Моя особиста нотатка');
  assert.equal(h.api.attachMaterial(id, 0, ''), true);
  assert.equal(h.api.state.library[id].module, 0);
  assert.equal(h.api.state.library[id].topicKey, '');
  assert.equal(h.api.state.moduleBookmarks[7], undefined);
  assert.equal(h.api.state.studyResume.module, 0);
  assert.equal(h.api.state.act['2026-11-08'], undefined);
  assert.equal(h.api.attachMaterial(id, 99, ''), false);
  assert.equal(h.api.attachMaterial(id, 3, '7-1'), false);
});

test('The inbox offers one-action attachment and detachment is immediately reversible', () => {
  const h = setup(), record = add(h);
  action(h, 'resource-attach', { k: record.id, m: '5' });
  assert.equal(h.api.state.library[record.id].module, 5);
  action(h, 'resource-detach', { k: record.id });
  assert.equal(h.api.state.library[record.id].module, 0);
  assert.equal(h.api.libraryResults().some(r => r.id === record.id), true);
});

test('Catalog edits remain authoritative after reload instead of reverting to the legacy archives', () => {
  const h = setup(), id = 'module-3-m-legacy', oldTitle = h.api.state.materials[3][0].title;
  h.api.upsertMaterial({ title: 'Нова назва', module: 5 }, id);
  const reload = harness(h.storage.get(KEY), { now: NOW });
  assert.equal(reload.api.state.library[id].title, 'Нова назва');
  assert.equal(reload.api.state.library[id].module, 5);
  assert.equal(reload.api.state.materials[3][0].title, oldTitle);
  assert.equal(reload.api.allResources().filter(r => r.id === id).length, 1);
});

test('The material editor saves optional fields and module changes without replacing the material ID', () => {
  const h = setup(), id = 'module-3-m-legacy';
  h.api.openMatDialog(id);
  const form = { id: 'matform', dataset: { rid: id }, formValues: { title: 'Відредагована стаття', url: 'https://example.com/revised', type: 'Стаття', status: 'Вивчаю', module: '5', topic: '1', tags: 'стрес, увага', note: 'Оновлена нотатка', desc: 'Короткий опис' } };
  for (const fn of h.documentEvents.submit) fn({ target: form, preventDefault() {} });
  assert.equal(h.nodes.get('matdlg').open, false);
  assert.equal(h.api.state.library[id].module, 5);
  assert.equal(h.api.state.library[id].topicKey, '5-1');
  assert.deepEqual(plain(h.api.state.library[id].tags), ['стрес', 'увага']);
  assert.equal(h.api.state.resourceStates[id].note, 'Оновлена нотатка');
  assert.equal(h.api.state.library[id].id, id);
});

test('Modules render only attached catalog records and no longer own material-add forms', () => {
  const h = setup(), record = add(h, { title: 'Матеріал тільки п’ятого модуля' });
  h.api.attachMaterial(record.id, 5, '');
  h.context.location.hash = '#m5'; h.api.render();
  assert.match(h.nodes.get('main').innerHTML, /Матеріал тільки п’ятого модуля/);
  assert.doesNotMatch(h.nodes.get('main').innerHTML, /data-form="(?:material|topic-material)"/);
  h.api.attachMaterial(record.id, 0, ''); h.api.render();
  assert.doesNotMatch(h.nodes.get('main').innerHTML, /Матеріал тільки п’ятого модуля/);
  assert.equal(h.api.state.library[record.id].title, record.title);
});

test('The module picker attaches existing items into a topic without copying them', () => {
  const h = setup(), record = add(h), count = h.api.allResources(true).length;
  h.api.openMaterialPicker(4, '4-1');
  action(h, 'picker-attach', { k: record.id });
  assert.equal(h.api.state.library[record.id].module, 4);
  assert.equal(h.api.state.library[record.id].topicKey, '4-1');
  assert.equal(h.api.allResources(true).length, count);
  assert.equal(h.nodes.get('attach-dialog').open, true);
});

test('Tags are normalized without duplicate case variants and remain searchable', () => {
  const h = setup(), record = add(h, { tags: ' #КПТ, пам’ять, кпт; увага\nстрес ' });
  assert.deepEqual(plain(record.tags), ['КПТ', 'пам’ять', 'увага', 'стрес']);
  h.api.libraryView.tag = 'кпт';
  assert.equal(h.api.libraryResults().some(r => r.id === record.id), true);
  h.api.libraryView.tag = ''; h.api.libraryView.q = 'пам’ять';
  assert.equal(h.api.libraryResults().some(r => r.id === record.id), true);
});

test('Search includes saved notes, descriptions, URLs and tags, combined with filters', () => {
  const h = setup(), r = add(h, { title: 'Мій огляд', url: 'https://example.com/unusual-path', type: 'Стаття', desc: 'Вибіркова увага', tags: 'когніція', note: 'Важливий висновок' });
  for (const q of ['МІЙ ОГЛЯД', 'unusual-path', 'вибіркова', 'когніція', 'важливий висновок']) { h.api.libraryView.q = q; assert.ok(h.api.libraryResults().some(x => x.id === r.id), q); }
  h.api.libraryView.type = 'Книга'; assert.equal(h.api.libraryResults().length, 0);
  h.api.libraryView.type = 'Стаття'; h.api.libraryView.module = '0'; assert.equal(h.api.libraryResults().length, 1);
});

test('Status filtering uses the requested labels while retaining the original stored status values', () => {
  const h = setup(), record = add(h);
  h.api.render();
  const card = h.api.resourceCard(record);
  assert.match(card, />Хочу<\/option>/); assert.match(card, />Дивлюсь<\/option>/); assert.match(card, />Переглянуто<\/option>/);
  change(h, { dataset: { a: 'resource-status', k: record.id }, value: 'Опрацьовано' });
  assert.equal(h.api.state.resourceStates[record.id].status, 'Опрацьовано');
  h.api.libraryView.status = 'Опрацьовано';
  assert.ok(h.api.libraryResults().some(r => r.id === record.id));
});

test('A previously completed resource keeps its completion date when title or note changes', () => {
  const h = setup(), r = add(h, { status: 'Опрацьовано' });
  const time = h.api.completionTime(h.api.state.resourceStates[r.id]);
  h.clock.now += 86400000; h.api.upsertMaterial({ title: 'Виправлена назва', note: 'Доповнена нотатка' }, r.id);
  assert.equal(h.api.completionTime(h.api.state.resourceStates[r.id]), time);
});

test('Soft deletion and restoration preserve custom records, notes, tags and completion history', () => {
  const h = setup(), r = add(h, { tags: 'КПТ', note: 'Не загубити', status: 'Опрацьовано' }), state = JSON.stringify(h.api.state.resourceStates[r.id]);
  action(h, 'res-del', { k: r.id });
  assert.equal(h.api.allResources().some(x => x.id === r.id), false);
  assert.equal(h.api.allResources(true).some(x => x.id === r.id), true);
  assert.equal(JSON.stringify(h.api.state.resourceStates[r.id]), state);
  const reload = harness(h.storage.get(KEY), { now: NOW });
  assert.equal(reload.api.state.hidden[r.id], true);
  reload.api.setMaterialHidden(r.id, false);
  assert.deepEqual(plain(reload.api.state.library[r.id].tags), ['КПТ']);
  assert.equal(reload.api.state.resourceStates[r.id].note, 'Не загубити');
});

test('Archived legacy arrays cannot resurrect a deleted canonical item after reload', () => {
  const h = setup(), id = 'module-3-m-legacy';
  h.api.setMaterialHidden(id, true);
  const reload = harness(h.storage.get(KEY), { now: NOW });
  assert.equal(reload.api.state.materials[3][0].id, 'm-legacy');
  assert.equal(reload.api.allResources().some(r => r.id === id), false);
  assert.equal(reload.api.allResources(true).filter(r => r.id === id).length, 1);
});

test('Tag shortcuts in deleted items keep the deleted-items scope', () => {
  const h = setup(), r = add(h, { tags: 'увага' });
  h.api.setMaterialHidden(r.id, true); action(h, 'lib-scope', { v: 'trash' });
  action(h, 'lib-tag', { v: 'увага' });
  assert.equal(h.api.libraryView.scope, 'trash');
  assert.equal(h.api.libraryResults().length, 1);
  assert.equal(h.api.libraryResults()[0].id, r.id);
});

test('Batch deletion and restore use the same recoverable catalog records', () => {
  const h = setup(), a = add(h), b = add(h, { title: 'Другий' });
  h.api.librarySelected.add(a.id); h.api.librarySelected.add(b.id);
  action(h, 'lib-batch', { v: 'del' });
  assert.equal(h.api.state.hidden[a.id], true); assert.equal(h.api.state.hidden[b.id], true);
  h.api.librarySelected.add(a.id); h.api.librarySelected.add(b.id);
  action(h, 'lib-batch', { v: 'restore' });
  assert.equal(h.api.state.hidden[a.id], undefined); assert.equal(h.api.state.hidden[b.id], undefined);
});

test('Paging limits the initial list and filter changes preserve an unfinished quick-add draft', () => {
  const h = setup();
  assert.equal([...h.nodes.get('main').innerHTML.matchAll(/<article /g)].length, 30);
  action(h, 'lib-more');
  assert.equal([...h.nodes.get('library-list').innerHTML.matchAll(/<article /g)].length, 60);
  h.nodes.get('quick-title').value = 'Ще не збережена чернетка';
  h.nodes.get('lib-q').value = 'психологія'; h.api.refreshLib();
  assert.equal(h.nodes.get('quick-title').value, 'Ще не збережена чернетка');
  assert.equal(h.api.libraryView.limit, 30);
});

test('YouTube detection handles watch, short, live and embedded links without accepting lookalike hosts', () => {
  const h = setup(), id = 'ATiaILMoLw0';
  for (const url of ['https://youtu.be/' + id, 'https://www.youtube.com/watch?v=' + id, 'https://m.youtube.com/shorts/' + id, 'https://www.youtube.com/live/' + id, 'https://www.youtube-nocookie.com/embed/' + id]) assert.equal(h.api.youtubeInfo(url).id, id);
  assert.equal(h.api.youtubeInfo('https://youtube.com.evil.example/watch?v=' + id), null);
  assert.equal(h.api.youtubeInfo('https://www.youtube.com/results?search_query=psychology'), null);
});

test('Initial library and module markup makes no image or iframe requests', () => {
  const h = setup();
  assert.doesNotMatch(h.nodes.get('main').innerHTML, /<(?:iframe|img)\b[^>]*\bsrc=/);
  h.context.location.hash = '#m1'; h.api.render();
  assert.doesNotMatch(h.nodes.get('main').innerHTML, /<(?:iframe|img)\b[^>]*\bsrc=/);
  assert.match(h.nodes.get('main').innerHTML, /data-a="youtube-load"/);
});

test('Only an explicit click creates the YouTube thumbnail and player', () => {
  const h = setup(), r = add(h, { url: 'https://youtu.be/ATiaILMoLw0' }); h.api.render();
  const card = h.nodes.get('resource:' + r.id), box = { dataset: {}, innerHTML: '' };
  card.querySelector = selector => selector === '[data-youtube-box]' ? box : null;
  assert.equal(box.innerHTML, ''); action(h, 'youtube-load', { k: r.id });
  assert.match(box.innerHTML, /<iframe[^>]+youtube-nocookie\.com/);
  assert.match(box.innerHTML, /<img[^>]+i\.ytimg\.com/);
  assert.equal(h.api.state.studyResume.resourceId, r.id);
  const content = box.innerHTML; action(h, 'youtube-load', { k: r.id }); assert.equal(box.innerHTML, content);
});

test('Offline video clicks leave the local notes and preview usable without creating a player', () => {
  const h = setup(), r = add(h, { url: 'https://youtu.be/ATiaILMoLw0', note: 'Моя нотатка' }); h.api.render();
  const box = { dataset: {}, innerHTML: 'Локальна картка' }; h.nodes.get('resource:' + r.id).querySelector = () => box;
  h.context.navigator.onLine = false;
  assert.equal(h.api.loadYouTube(r.id), false); assert.equal(box.innerHTML, 'Локальна картка');
  assert.equal(h.api.state.resourceStates[r.id].note, 'Моя нотатка');
});

test('Continue can reopen an unattached inbox material without a nonexistent module zero', () => {
  const h = setup(), r = add(h); h.api.rememberResource(r.id);
  const target = h.api.resumeTarget(); assert.equal(target.module, 0);
  const link = h.api.resumeHref(target); assert.equal(link, '#library?material=' + r.id);
  h.context.location.hash = '#overview'; h.api.render();
  assert.match(h.nodes.get('main').innerHTML, /Матеріал із бібліотеки/);
  h.context.location.hash = link;
  for (const fn of h.windowEvents.hashchange) fn({});
  assert.equal(h.context.document.activeElement.dataset.resource, r.id);
});

test('The single backup file round-trips the catalog, trash, tags, notes and legacy archives', () => {
  const h = setup(), r = add(h, { tags: 'увага, КПТ', note: 'Важливий запис', type: 'Стаття' });
  h.api.attachMaterial(r.id, 5, '5-1'); h.api.setMaterialHidden('module-3-m-legacy', true);
  const backup = JSON.stringify(h.api.createBackup()), other = setup();
  assert.equal(other.api.applyBackup(other.api.decodeBackup(backup)), true);
  assert.deepEqual(plain(other.api.state.library), plain(h.api.state.library));
  assert.deepEqual(plain(other.api.state.materials), plain(h.api.state.materials));
  assert.deepEqual(plain(other.api.state.resourceStates), plain(h.api.state.resourceStates));
  assert.equal(other.api.state.hidden['module-3-m-legacy'], true);
});

test('Malformed or incompatible catalog imports never replace the current saved state', () => {
  const h = setup(), original = h.storage.get(KEY), id = 'module-3-m-legacy';
  for (const mutate of [s => { s.libraryVersion = 2; }, s => { s.library[id].module = 99; }, s => { s.library[id].tags = 'not-an-array'; }, s => { s.library[id].url = 'javascript:alert(1)'; }, s => { s.library[id].id = 'different-key'; }]) {
    const copy = plain(h.api.createBackup()); mutate(copy.state);
    assert.throws(() => h.api.decodeBackup(JSON.stringify(copy)));
    assert.equal(h.storage.get(KEY), original);
  }
});

test('If catalog persistence fails, the original legacy data remains intact and an error is visible', () => {
  const old = legacyState(), raw = JSON.stringify(old), h = setup({}, { failWrites: true });
  add(h, { title: 'Тимчасова зміна' });
  assert.equal(h.storage.get(KEY), raw);
  assert.ok(h.api.error);
  assert.equal(h.nodes.get('storage-notice').hidden, false);
});

test('User-supplied titles, notes and tags are escaped when rendering resource cards', () => {
  const h = setup(), r = add(h, { title: '<img src=x onerror=alert(1)>', note: '</textarea><script>alert(1)</script>', tags: '"><img src=x>' });
  const card = h.api.resourceCard(r);
  assert.doesNotMatch(card, /<script>|<img src=x/);
  assert.match(card, /&lt;img/); assert.match(card, /&lt;\/textarea&gt;/);
});

module.exports = { passed: previous.passed + cases.length, stage4Passed: cases.length, cases };
if (require.main === module) console.log(`${previous.passed + cases.length} checks passed (${cases.length} stage 4).`);
