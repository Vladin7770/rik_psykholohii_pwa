'use strict';
// Run with: node tests/stage5.test.cjs
const assert = require('node:assert/strict');
const previous = require('./stage4.test.cjs');
const { harness, legacyState } = require('./stage2.test.cjs');
const KEY = 'psykholohiia-rik-v1', NOW = new Date(2026, 10, 8, 12).getTime();
const plain = x => JSON.parse(JSON.stringify(x));
const cases = [];
function test(name, run) { run(); cases.push(name); }
function setup(extra = {}, options = {}) { return harness(JSON.stringify(Object.assign(legacyState(), extra)), { now: NOW, ...options }); }
function action(h, a, extra = {}) {
  const target = { id: '', dataset: { a, ...extra } };
  target.closest = selector => selector === '[data-a]' ? target : null;
  for (const fn of h.documentEvents.click) fn({ target, preventDefault() {} });
}
function navigate(h, hash) { h.context.location.hash = hash; for (const fn of h.windowEvents.hashchange) fn({}); }
function makeCard(h, module = 3, resourceId = '') { return h.api.createStudyCard('Запитання?', 'Коротка відповідь', module, resourceId); }
function grade(h, id, known = true) {
  const current = h.api.currentReviewCard(); assert.equal(current.id, id);
  h.api.revealReviewCard(); assert.equal(h.api.gradeReviewCard(id, known), true);
}

test('Creating a card needs two fields, retains source context and does not disturb legacy cards', () => {
  const h = setup(), before = plain(h.api.state.cards), card = h.api.createStudyCard('Що таке увага?', 'Вибіркова спрямованість', 3, 'module-3-m-legacy');
  assert.equal(card.module, 3); assert.equal(card.resourceId, 'module-3-m-legacy');
  assert.equal(card.dueAt, NOW); assert.equal(card.reviewStep, -1);
  assert.deepEqual(plain(h.api.state.cards.slice(0, before.length)), before);
  assert.ok(h.api.dueCards(3).some(c => c.id === card.id));
});

test('Rapid card creation generates distinct IDs even within the same millisecond', () => {
  const h = setup({ cards: [] }), ids = [];
  for (let i = 0; i < 30; i++) ids.push(makeCard(h).id);
  assert.equal(new Set(ids).size, 30);
});

test('The card dialog saves a source-linked card through its real submit handler', () => {
  const h = setup(); h.api.saveResourceRecall('module-3-m-legacy', 'Головна думка матеріалу');
  h.api.openCardDialog('module-3-m-legacy');
  assert.match(h.nodes.get('card-dialog').innerHTML, /Головна думка матеріалу/);
  const form = { id: 'study-card-form', dataset: { resourceId: 'module-3-m-legacy' }, formValues: { front: 'Ключове питання?', back: 'Головна думка матеріалу', module: '3' } };
  for (const fn of h.documentEvents.submit) fn({ target: form, preventDefault() {} });
  assert.equal(h.nodes.get('card-dialog').open, false);
  const card = h.api.state.cards.find(c => c.front === 'Ключове питання?');
  assert.equal(card.resourceId, 'module-3-m-legacy');
  assert.equal(card.back, 'Головна думка матеріалу');
});

test('Invalid or empty cards cannot create partial state', () => {
  const h = setup(), before = JSON.stringify(h.api.state);
  for (const args of [['', 'відповідь', 3], ['питання', '', 3], ['питання', 'відповідь', 99], ['питання', 'відповідь', 'invalid'], ['питання', 'відповідь', 3, 'missing-resource']]) assert.throws(() => h.api.createStudyCard(...args));
  assert.equal(JSON.stringify(h.api.state), before);
});

test('Correct answers schedule exactly 1, 3, 7, 14 and 30 calendar days', () => {
  const h = setup({ cards: [] }, { hash: '#review?module=3' }), card = makeCard(h);
  for (const days of [1, 3, 7, 14, 30, 30]) {
    const now = new h.context.Date(), expected = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days).getTime();
    grade(h, card.id);
    assert.equal(card.intervalDays, days);
    assert.equal(card.dueAt, expected);
    assert.equal(h.api.dueCards(3).length, 0);
    h.clock.now = card.dueAt;
    assert.equal(h.api.dueCards(3).length, 1);
  }
});

test('Forgetting returns a mature card to tomorrow, followed by the three-day step', () => {
  const h = setup({ cards: [{ id: 'mature', front: 'Питання', back: 'Відповідь', module: 3, lastReviewed: NOW - 86400000, dueAt: NOW, intervalDays: 30, box: 5 }] }, { hash: '#review?module=3' });
  grade(h, 'mature', false);
  const card = h.api.state.cards[0]; assert.equal(card.intervalDays, 1); assert.equal(card.known, false);
  h.clock.now = card.dueAt; grade(h, 'mature', true); assert.equal(card.intervalDays, 3);
});

test('Repeat dates follow local calendar days across the spring clock change', () => {
  const h = setup({ cards: [] }, { hash: '#review?module=3', now: new Date(2026, 2, 28, 12).getTime() }), card = makeCard(h);
  grade(h, card.id);
  assert.equal(h.api.iso(new h.context.Date(card.dueAt)), '2026-03-29');
  h.clock.now = card.dueAt; grade(h, card.id);
  assert.equal(h.api.iso(new h.context.Date(card.dueAt)), '2026-04-01');
  assert.equal(new h.context.Date(card.dueAt).getHours(), 0);
});

test('The old schedule is preserved on load and advances from its existing interval only when reviewed', () => {
  const due = NOW - 1000, old = { id: 'old', front: 'Стара картка', back: 'Не змінювати', module: 3, box: 3, intervalDays: 7, lastReviewed: NOW - 7 * 86400000, dueAt: due };
  const h = setup({ cards: [old] }, { hash: '#review?module=3' });
  assert.deepEqual(plain(h.api.state.cards[0]), old);
  grade(h, 'old'); assert.equal(h.api.state.cards[0].intervalDays, 14);
});

test('An unreviewed legacy card starts at one day even when it already has a seed interval', () => {
  const h = setup({ cards: [{ id: 'seeded', front: 'Seed', back: 'Answer', module: 3, box: 1, intervalDays: 1, dueAt: NOW }] }, { hash: '#review?module=3' });
  grade(h, 'seeded'); assert.equal(h.api.state.cards[0].intervalDays, 1);
});

test('Grading requires revealing the current answer and rejects stale or duplicate clicks', () => {
  const h = setup({ cards: [] }, { hash: '#review?module=3' }), first = makeCard(h), second = makeCard(h);
  const current = h.api.currentReviewCard();
  assert.equal(h.api.gradeReviewCard(current.id, true), false);
  grade(h, current.id);
  const counted = h.api.state.cardReviewDays['2026-11-08'];
  assert.equal(h.api.gradeReviewCard(current.id, true), false);
  assert.equal(h.api.state.cardReviewDays['2026-11-08'], counted);
  h.api.revealReviewCard();
  assert.equal(h.api.gradeReviewCard(current.id, true), false);
  assert.equal(first.reviewCount || second.reviewCount, 1);
});

test('The click handler grades only the card ID displayed on the clicked button', () => {
  const h = setup({ cards: [] }, { hash: '#review' }), card = makeCard(h);
  action(h, 'card-flip'); action(h, 'card-grade', { k: '1', cardId: card.id });
  action(h, 'card-grade', { k: '1', cardId: card.id });
  assert.equal(h.api.state.cardReviewDays['2026-11-08'], 1);
});

test('Module-specific review includes only due cards in that module', () => {
  const h = setup({ cards: [] }, { hash: '#review?module=3' });
  const a = makeCard(h, 3), b = makeCard(h, 5), c = makeCard(h, 3); c.dueAt = NOW + 86400000;
  assert.deepEqual(plain(h.api.dueCards(3).map(x => x.id)), [a.id]);
  assert.equal(h.api.currentReviewCard().id, a.id);
  navigate(h, '#review?module=5'); assert.equal(h.api.currentReviewCard().id, b.id);
  assert.equal(h.api.reviewRevealed, false);
});

test('General cards without a module are available in the module-zero review filter', () => {
  const h = setup({ cards: [{ id: 'general', front: 'Без модуля', back: 'Текст' }] }, { hash: '#review?module=0' });
  assert.equal(h.api.currentReviewCard().id, 'general');
  assert.match(h.nodes.get('main').innerHTML, /value="0" selected>Без модуля/);
});

test('Malformed old due dates remain discoverable instead of hiding cards forever', () => {
  const h = setup({ cards: [{ id: 'unknown-date', front: 'Питання', back: 'Відповідь', dueAt: 'unknown' }] });
  assert.ok(h.api.dueCards().some(c => c.id === 'unknown-date'));
  assert.equal(h.api.state.cards[0].dueAt, 'unknown');
});

test('Legacy duplicate card IDs are both retained and the actually displayed record is updated', () => {
  const h = setup({ cards: [{ id: 'same', front: 'Перша', back: 'А', module: 3, dueAt: NOW }, { id: 'same', front: 'Друга', back: 'Б', module: 3, dueAt: NOW }] }, { hash: '#review?module=3' });
  grade(h, 'same'); assert.equal(h.api.state.cards[0].reviewCount, 1);
  grade(h, 'same'); assert.equal(h.api.state.cards[1].reviewCount, 1);
  assert.equal(h.api.state.cardReviewDays['2026-11-08'], 2);
});

test('Card deletion is recoverable and restoration keeps its exact schedule', () => {
  const h = setup({ cards: [] }), card = makeCard(h), original = JSON.stringify(card);
  assert.equal(h.api.setCardHidden(card.id, true), true);
  assert.equal(h.api.dueCards(3).length, 0);
  assert.equal(h.api.state.cards.length, 1);
  const reload = harness(h.storage.get(KEY), { now: NOW });
  assert.equal(reload.api.setCardHidden(card.id, false), true);
  assert.equal(JSON.stringify(reload.api.state.cards[0]), original);
  assert.equal(reload.api.dueCards(3).length, 1);
});

test('Completing a material prompts for one reflection without overwriting its existing note', () => {
  const h = setup(), id = 'module-3-m-legacy', note = h.api.state.resourceStates[id].note;
  assert.equal(h.api.finishResource(id), true);
  assert.equal(h.nodes.get('recall-dialog').open, true);
  assert.match(h.nodes.get('recall-dialog').innerHTML, /Що я запам’ятав/);
  assert.equal(h.api.state.resourceStates[id].note, note);
  assert.equal(h.api.state.resourceStates[id].recallPending, true);
});

test('When its card is visible, completion expands the inline reflection instead of another dialog', () => {
  const h = setup({}, { hash: '#m3' }), id = 'module-3-m-legacy', card = h.nodes.get('resource:' + id), detail = { open: false }, panel = { hidden: true, querySelector: () => detail };
  card.querySelector = selector => selector === '[data-reflection]' ? panel : null;
  h.api.finishResource(id);
  assert.equal(panel.hidden, false); assert.equal(detail.open, true);
  assert.equal(h.nodes.get('recall-dialog').open, false);
});

test('Reflection autosave retains the completion time, survives reload and prefills a linked card', () => {
  const h = setup(), id = 'module-3-m-legacy'; h.api.finishResource(id);
  const time = h.api.completionTime(h.api.state.resourceStates[id]); h.clock.now += 5000;
  h.api.saveResourceRecall(id, 'Одне важливе відкриття');
  assert.equal(h.api.completionTime(h.api.state.resourceStates[id]), time);
  const reload = harness(h.storage.get(KEY), { now: NOW + 5000 });
  assert.equal(reload.api.state.resourceStates[id].recall, 'Одне важливе відкриття');
  reload.api.openCardDialog(id);
  assert.match(reload.nodes.get('card-dialog').innerHTML, /Одне важливе відкриття/);
});

test('Skipping a reflection preserves completion and counts no additional study day or step', () => {
  const h = setup(), id = 'module-3-m-legacy'; h.api.finishResource(id);
  const day = JSON.stringify(h.api.state.act), goal = h.api.goalProgress().current;
  h.api.dismissReflection(id);
  assert.equal(h.api.state.resourceStates[id].status, 'Опрацьовано');
  assert.equal(h.api.state.resourceStates[id].recallPending, false);
  assert.equal(JSON.stringify(h.api.state.act), day); assert.equal(h.api.goalProgress().current, goal);
});

test('Saved reading views persist independently per module and are not learning activity', () => {
  const h = setup(), views = { 3: { scrollY: 800, anchor: 'note:module-3-m-legacy', offset: -30, panels: ['notes', 'topics'], resources: ['module-3-m-legacy'] }, 5: { scrollY: 120, anchor: '', offset: 0, panels: ['work'], resources: [] } };
  for (const n of [3, 5]) assert.equal(h.api.saveModuleView(n, views[n]), true);
  assert.equal(h.api.state.act['2026-11-08'], undefined);
  const reload = harness(h.storage.get(KEY), { now: NOW });
  assert.deepEqual(plain(reload.api.state.moduleViews[3]), views[3]);
  assert.deepEqual(plain(reload.api.state.moduleViews[5]), views[5]);
  assert.equal(reload.api.modulePanelOpen(3, 'notes', false), true);
  assert.equal(reload.api.modulePanelOpen(3, 'quiz', false), false);
});

test('Reading capture and restoration preserve the visible anchor when content height changes', () => {
  const h = setup({}, { hash: '#m3' });
  let absoluteTop = 200;
  const anchor = { dataset: { readingAnchor: 'note:module-3-m-legacy' }, getClientRects: () => [1], getBoundingClientRect: () => ({ top: absoluteTop - h.context.scrollY, bottom: absoluteTop + 500 - h.context.scrollY }) };
  const root = { dataset: { moduleView: '3' }, querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 100 }) }), querySelectorAll: selector => selector === '[data-reading-anchor]' ? [anchor] : selector === 'details[data-module-panel]' ? [{ open: true, dataset: { modulePanel: 'notes' } }] : [{ open: true, dataset: { resourceDetails: 'module-3-m-legacy' } }] };
  h.nodes.get('main').querySelector = selector => selector === '[data-module-view]' ? root : null;
  h.context.scrollY = 250; assert.equal(h.api.captureReadingView(3), true);
  assert.equal(h.api.state.moduleViews[3].anchor, 'note:module-3-m-legacy');
  assert.equal(h.api.state.moduleViews[3].offset, -150);
  absoluteTop = 400; h.context.scrollY = 0;
  assert.equal(h.api.restoreReadingView(3), true);
  assert.equal(h.context.lastScroll.top, 450);
});

test('Explicit material links take priority over an old module scroll position', () => {
  const h = setup(); h.api.saveModuleView(3, { scrollY: 900, anchor: '', offset: 0, panels: [], resources: [] });
  navigate(h, '#m3?material=topic-3-2-t-legacy');
  assert.equal(h.context.document.activeElement.dataset.resource, 'topic-3-2-t-legacy');
});

test('Module note and work drafts remain available inside the compact panels', () => {
  const h = setup({ notes: { 3: 'Мій збережений конспект' }, work: { 3: 'Чернетка практичної роботи' }, topicNotes: { '3-2': 'Особиста нотатка до теми' } }, { hash: '#m3' });
  const markup = h.nodes.get('main').innerHTML;
  for (const text of ['Мій збережений конспект', 'Чернетка практичної роботи', 'Особиста нотатка до теми']) assert.match(markup, new RegExp(text));
  assert.match(markup, /data-module-panel="notes"/);
  assert.match(markup, /href="#review\?module=3"/);
  assert.equal([...markup.matchAll(/aria-label="Модуль \d+:/g)].length, 12);
});

test('Backup round-trips review schedules, deleted cards, reflections and reading positions', () => {
  const h = setup({ cards: [] }, { hash: '#review?module=3' }), card = makeCard(h, 3, 'module-3-m-legacy');
  grade(h, card.id); h.api.setCardHidden(card.id, true);
  h.api.saveResourceRecall('module-3-m-legacy', 'Збережене пригадування');
  h.api.saveModuleView(3, { scrollY: 100, anchor: '', offset: 0, panels: ['work'], resources: [] });
  const other = setup(), backup = JSON.stringify(h.api.createBackup());
  assert.equal(other.api.applyBackup(other.api.decodeBackup(backup)), true);
  for (const key of ['cards', 'cardTrash', 'moduleViews', 'resourceStates']) assert.deepEqual(plain(other.api.state[key]), plain(h.api.state[key]), key);
});

test('Malformed new state fields are rejected without replacing saved data', () => {
  const h = setup(), original = h.storage.get(KEY);
  for (const alter of [s => { s.cards[0].reviewStep = 99; }, s => { s.resourceStates['module-3-m-legacy'].recall = {}; }, s => { s.moduleViews[3] = { scrollY: -1, panels: [], resources: [] }; }]) {
    const backup = plain(h.api.createBackup()); alter(backup.state);
    assert.throws(() => h.api.decodeBackup(JSON.stringify(backup)));
    assert.equal(h.storage.get(KEY), original);
  }
});

module.exports = { passed: previous.passed + cases.length, stage5Passed: cases.length, cases };
if (require.main === module) console.log(`${previous.passed + cases.length} checks passed (${cases.length} stage 5).`);
