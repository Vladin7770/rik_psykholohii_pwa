'use strict';
// Run with: node tests/stage3.test.cjs
// Includes the stage 2 data-preservation regression suite.
const assert = require('node:assert/strict');
const base = require('./stage2.test.cjs');
const { harness, legacyState } = base;
const KEY = 'psykholohiia-rik-v1';
const NOW = new Date(2026, 10, 8, 12, 0, 0).getTime();
const plain = value => JSON.parse(JSON.stringify(value));
const cases = [];
function test(name, run) { run(); cases.push(name); }
function setup(extra = {}, options = {}) {
  return harness(JSON.stringify(Object.assign(legacyState(), extra)), { now: NOW, ...options });
}
function emit(h, type, target, extra = {}) {
  const event = { target, preventDefault() {}, ...extra };
  for (const fn of h.documentEvents[type] || []) fn(event);
}
function action(h, name, dataset = {}) {
  const element = { id: '', dataset: { a: name, ...dataset } };
  element.closest = () => element;
  emit(h, 'click', element);
}
function navigate(h, hash) {
  h.context.location.hash = hash;
  for (const fn of h.windowEvents.hashchange) fn({});
}

test('Old backups receive new optional defaults without losing their existing fields', () => {
  const old = legacyState(), h = setup();
  assert.deepEqual(plain(h.api.goalSettings()), { unit: 'minutes', target: 25 });
  assert.deepEqual(plain(h.api.state.studyResume), { module: 0, resourceId: '' });
  for (const key of Object.keys(old)) assert.deepEqual(plain(h.api.state[key]), old[key], key);
  assert.equal(h.storage.get(KEY), JSON.stringify(old));
});

test('Goal preferences persist and neither settings nor navigation count as studying', () => {
  const h = setup();
  const actBefore = JSON.stringify(h.api.state.act), minutesBefore = JSON.stringify(h.api.state.days);
  assert.equal(h.api.setDailyGoal('steps', 3), true);
  navigate(h, '#m7'); navigate(h, '#overview');
  assert.equal(JSON.stringify(h.api.state.act), actBefore);
  assert.equal(JSON.stringify(h.api.state.days), minutesBefore);
  const reloaded = harness(h.storage.get(KEY), { now: NOW });
  assert.deepEqual(plain(reloaded.api.goalSettings()), { unit: 'steps', target: 3 });
});

test('Invalid goals are rejected in the UI logic and in backups', () => {
  const h = setup();
  for (const [unit, target] of [['minutes', 0], ['steps', 101], ['minutes', 181], ['steps', 1.2], ['other', 3], ['minutes', NaN]]) {
    assert.equal(h.api.setDailyGoal(unit, target), false);
    const backup = { ...legacyState(), dailyGoal: { unit, target } };
    assert.throws(() => h.api.decodeBackup(JSON.stringify(backup)));
  }
  assert.equal(h.api.goalSettings().target, 25);
});

test('The goal dialog supports presets, cancellation and saving steps through the submit handler', () => {
  const h = setup();
  action(h, 'goal-open'); assert.equal(h.nodes.get('goal-dialog').open, true);
  action(h, 'goal-preset', { k: '10' }); assert.equal(h.nodes.get('goal-number').value, '10');
  action(h, 'goal-cancel'); assert.equal(h.api.goalSettings().target, 25);
  action(h, 'goal-open');
  const unit = h.nodes.get('goal-unit'); unit.dataset.a = 'goal-unit'; unit.value = 'steps';
  emit(h, 'change', unit);
  assert.equal(h.nodes.get('goal-number').max, '100');
  emit(h, 'submit', { id: 'daily-goal-form', formValues: { unit: 'steps', target: '5' } });
  assert.deepEqual(plain(h.api.goalSettings()), { unit: 'steps', target: 5 });
  assert.equal(h.nodes.get('goal-dialog').open, false);
  assert.equal(h.context.document.activeElement.id, 'goal-change');
});

test('Minute goals display actual totals and clamp only the visual progress', () => {
  const h = setup({ days: { '2026-11-08': 35 } });
  assert.deepEqual(plain(h.api.goalProgress()), { unit: 'minutes', target: 25, current: 35, pct: 100 });
  assert.match(h.nodes.get('main').innerHTML, /aria-valuenow="25"/);
  assert.match(h.nodes.get('main').innerHTML, /Готово на сьогодні/);
});

test('Step goals count topics, finished materials and card reviews on the current local date', () => {
  const h = setup({ topicHistory: { '3-2': NOW }, cardReviewDays: { '2026-11-08': 2, '2026-11-07': 10 } });
  h.api.setDailyGoal('steps', 5);
  h.api.setResourceStatus(h.api.state, 'module-3-m-legacy', 'Опрацьовано');
  assert.equal(h.api.goalProgress().current, 4);
  assert.equal(h.api.goalProgress().pct, 80);
  h.api.state.resourceStates['module-3-m-legacy'].note = 'Редагування не є ще одним кроком';
  h.api.setResourceStatus(h.api.state, 'module-3-m-legacy', 'Опрацьовано');
  assert.equal(h.api.goalProgress().current, 4);
});

test('Completion dates survive metadata edits, so old materials do not become new daily steps', () => {
  const earlier = new Date(2026, 9, 30, 12).getTime();
  const h = setup();
  h.api.state.resourceStates['module-3-m-legacy'] = { status: 'Опрацьовано', updatedAt: earlier, note: 'Зберегти' };
  h.api.setDailyGoal('steps', 3);
  action(h, 'res-core', { k: 'module-3-m-legacy' });
  const state = h.api.state.resourceStates['module-3-m-legacy'];
  assert.equal(state.updatedAt, NOW);
  assert.equal(h.api.completionTime(state), earlier);
  assert.equal(h.api.goalProgress().current, 0);
  assert.equal(h.api.state.act['2026-11-08'], undefined);
});

test('Correcting an earlier day and scheduling tasks do not create a study day today', () => {
  const h = setup();
  emit(h, 'change', { dataset: { a: 'day', d: '2026-11-07' }, value: '35' });
  emit(h, 'submit', { id: '', dataset: { form: 'task', m: '3' }, formValues: { title: 'Прочитати завтра', desc: '' } });
  emit(h, 'submit', { id: '', dataset: { form: 'event' }, formValues: { date: '2026-11-09', title: 'Майбутня лекція', module: '3', note: '' } });
  assert.equal(h.api.state.days['2026-11-07'], 35);
  assert.equal(h.api.state.act['2026-11-08'], undefined);
  assert.equal(h.api.state.tasks[3].length, 1);
  assert.equal(h.api.state.events.length, 1);
});

test('Writing a study note counts as activity, while editing the timer task does not', () => {
  const h = setup();
  const field = (bind, key, value) => ({ id: '', dataset: { bind, k: key }, value, style: {}, scrollHeight: 110, classList: { contains: () => true } });
  emit(h, 'input', field('focusTask', 'today', 'Мій план'));
  assert.equal(h.api.state.act['2026-11-08'], undefined);
  emit(h, 'input', field('courseNotes', 'all', 'Що я зрозумів сьогодні'));
  assert.equal(h.api.state.act['2026-11-08'], 1);
  assert.equal(h.api.state.courseNotes, 'Що я зрозумів сьогодні');
});

test('A newly completed daily goal is recorded once and survives a reload', () => {
  const h = setup();
  h.api.setDailyGoal('steps', 1);
  h.api.mutate(s => h.api.setResourceStatus(s, 'module-3-m-legacy', 'Опрацьовано'));
  assert.equal(h.api.state.dailyWins['2026-11-08'], true);
  const reload = harness(h.storage.get(KEY), { now: NOW });
  assert.equal(reload.api.state.dailyWins['2026-11-08'], true);
  assert.match(reload.nodes.get('main').innerHTML, /Готово на сьогодні/);
});

test('Resume prefers the last visited module over the first unfinished one', () => {
  const h = setup();
  navigate(h, '#m7'); navigate(h, '#overview');
  assert.equal(h.api.resumeTarget().module, 7);
  assert.match(h.nodes.get('main').innerHTML, /href="#study\?material=builtin-media-7-0&amp;resume=1">Продовжити/);
  assert.equal(h.api.state.act['2026-11-08'], undefined);
  const reloaded = harness(h.storage.get(KEY), { now: NOW });
  assert.equal(reloaded.api.resumeTarget().module, 7);
});

test('Intentional source opening remembers its stable material ID, including from the library', () => {
  const h = setup({}, { hash: '#library' });
  action(h, 'resource-open', { k: 'module-3-m-legacy' });
  const result = h.api.resumeTarget();
  assert.equal(result.module, 3);
  assert.equal(result.resource.id, 'module-3-m-legacy');
  assert.equal(h.api.state.moduleBookmarks[3], 'module-3-m-legacy');
  assert.equal(h.api.state.act['2026-11-08'], undefined);
  assert.equal(h.api.resumeHref(result), '#study?material=module-3-m-legacy');
});

test('Focusing an embedded player remembers its material without using a player API', () => {
  const h = setup({}, { hash: '#library' });
  h.context.document.activeElement = {
    tagName: 'IFRAME', closest: () => ({ dataset: { resource: 'module-3-m-legacy' } })
  };
  for (const fn of h.windowEvents.blur) fn({});
  assert.equal(h.api.state.studyResume.resourceId, 'module-3-m-legacy');
  assert.equal(h.api.state.act['2026-11-08'], undefined);
});

test('The existing backup format round-trips goal preferences and study bookmarks', () => {
  const h = setup(); h.api.setDailyGoal('steps', 5); h.api.rememberResource('topic-3-2-t-legacy');
  const exported = JSON.stringify({ app: 'Рік психології', version: 1, state: h.api.state });
  const other = setup();
  assert.equal(other.api.applyBackup(other.api.decodeBackup(exported)), true);
  assert.deepEqual(plain(other.api.goalSettings()), { unit: 'steps', target: 5 });
  assert.equal(other.api.resumeTarget().resource.id, 'topic-3-2-t-legacy');
  assert.equal(other.api.state.moduleBookmarks[3], 'topic-3-2-t-legacy');
  assert.equal(other.api.state.resourceStates['module-3-m-legacy'].note, 'Моя особиста нотатка');
});

test('Every module keeps its own last material, and invalid or hidden bookmarks fall back safely', () => {
  const h = setup();
  h.api.rememberResource('module-3-m-legacy');
  h.api.rememberResource('builtin-media-1-0');
  navigate(h, '#m3');
  assert.equal(h.api.resumeTarget().resource.id, 'module-3-m-legacy');
  h.api.state.hidden['module-3-m-legacy'] = true;
  assert.equal(h.api.resumeTarget().module, 3);
  assert.equal(h.api.resumeTarget().resource, null);
  assert.equal(h.api.rememberResource('nonexistent'), false);
});

test('Legacy in-progress materials provide a sensible continuation before any bookmark exists', () => {
  const h = setup();
  assert.equal(h.api.resumeTarget().resource.id, 'module-3-m-legacy');
});

test('Direct material links load the correct module and focus the remembered card', () => {
  const h = setup({}, { hash: '#m3?material=topic-3-2-t-legacy' });
  assert.equal(h.api.route(), 'm3');
  assert.equal(h.api.state.studyResume.resourceId, 'topic-3-2-t-legacy');
  assert.equal(h.context.document.activeElement.dataset.resource, 'topic-3-2-t-legacy');
  assert.equal(h.context.document.activeElement.scrolled.block, 'start');
  navigate(h, '#m3?material=builtin-media-1-0');
  assert.equal(h.api.state.studyResume.module, 3);
  assert.notEqual(h.api.state.studyResume.resourceId, 'builtin-media-1-0');
});

test('Restoring a material opens collapsed ancestor sections and its notes', () => {
  const h = setup({}, { hash: '#m3' }), card = h.nodes.get('resource:topic-3-2-t-legacy');
  const details = { tagName: 'DETAILS', open: false, parentElement: null }, more = { open: false };
  card.parentElement = details; card.querySelector = () => more;
  assert.equal(h.api.restoreMaterial('topic-3-2-t-legacy'), true);
  assert.equal(details.open, true); assert.equal(more.open, true);
  assert.equal(h.context.document.activeElement, card);
});

test('Moving a material remaps current and per-module bookmarks without touching its notes', () => {
  const h = setup();
  h.api.rememberResource('module-3-m-legacy');
  h.api.remapBookmark('module-3-m-legacy', 'module-5-m-legacy', 5);
  assert.deepEqual(plain(h.api.state.studyResume), { module: 5, resourceId: 'module-5-m-legacy' });
  assert.equal(h.api.state.moduleBookmarks[3], undefined);
  assert.equal(h.api.state.moduleBookmarks[5], 'module-5-m-legacy');
  assert.equal(h.api.state.resourceStates['module-3-m-legacy'].note, 'Моя особиста нотатка');
});

test('One tap starts a ten-minute session and does not credit time in advance', () => {
  const h = setup({ days: {} });
  action(h, 'quick-ten');
  assert.equal(h.api.timer.dur, 600); assert.equal(h.api.timer.running, true);
  assert.equal(h.api.state.days['2026-11-08'], undefined);
  assert.match(h.nodes.get('main').innerHTML, /Завершити й зарахувати/);
  assert.doesNotMatch(h.nodes.get('main').innerHTML, /data-a="quick-ten"/);
  h.clock.now += 600000; h.api.timerTick();
  assert.equal(h.api.state.days['2026-11-08'], 10);
  assert.equal(h.api.timer.done, true);
});

test('Finishing, crediting and repeated ticks cannot count the same timer twice', () => {
  const h = setup({ days: {} });
  h.api.startShortSession(); h.clock.now += 600000; h.api.timerTick();
  h.api.timerTick(); h.api.timerAction('tm-credit'); h.api.timerAction('tm-credit');
  assert.equal(h.api.state.days['2026-11-08'], 10);
  h.api.startShortSession(); h.clock.now += 600000; h.api.timerTick();
  assert.equal(h.api.state.days['2026-11-08'], 20);
});

test('Pausing and resuming retains elapsed time and credits only completed minutes', () => {
  const h = setup({ days: {} });
  h.api.startShortSession(); h.clock.now += 90500; h.api.timerAction('tm-pause');
  assert.equal(h.api.timer.left, 510);
  const remaining = h.api.timer.left;
  assert.equal(h.api.startShortSession(), false); assert.equal(h.api.timer.left, remaining);
  h.clock.now += 3600000; h.api.timerAction('tm-start');
  h.clock.now += 30000; h.api.timerAction('tm-credit');
  assert.equal(h.api.state.days['2026-11-08'], 2);
});

test('Switching duration or resetting a paused session does not discard completed minutes', () => {
  const h = setup({ days: {} });
  h.api.startShortSession(); h.clock.now += 180000; h.api.timerAction('tm-pause');
  h.api.timerAction('tm-dur', 25);
  assert.equal(h.api.state.days['2026-11-08'], 3);
  assert.equal(h.api.timer.left, 1500);
  h.api.timerAction('tm-start'); h.clock.now += 120000; h.api.timerAction('tm-reset');
  assert.equal(h.api.state.days['2026-11-08'], 5);
});

test('The two existing timers cannot run concurrently', () => {
  const h = setup();
  h.api.startShortSession(); h.api.focusAction('focus-start');
  assert.equal(h.api.focus.running, false);
  h.api.timerAction('tm-credit'); h.api.focusAction('focus-start');
  assert.equal(h.api.focus.running, true);
  assert.equal(h.api.startShortSession(), false);
});

test('The weekly list shows actual completed subjects and excludes next week', () => {
  const monday = new Date(2026, 10, 2), nextMonday = new Date(2026, 10, 9);
  const h = setup({ days: { '2026-11-02': 20, '2026-11-08': 10, '2026-11-09': 99 }, topicHistory: { '3-2': NOW, '1-0': nextMonday.getTime() }, cardReviewDays: { '2026-11-08': 3 } });
  h.api.setResourceStatus(h.api.state, 'module-3-m-legacy', 'Опрацьовано');
  const summary = h.api.periodSummary(monday, nextMonday);
  assert.equal(summary.minutes, 30); assert.equal(summary.topics, 1);
  assert.equal(summary.materials, 1); assert.equal(summary.steps, 5);
  h.api.render(); assert.match(h.nodes.get('main').innerHTML, /Матеріал для перевірки/);
  assert.match(h.nodes.get('main').innerHTML, /Потреби, цінності й цілі/);
  assert.doesNotMatch(h.nodes.get('main').innerHTML, /class="activity-cell"/);
});

test('A rest day preserves the series and a longer pause keeps the previous series visible', () => {
  const h = setup({ days: { '2026-11-03': 10, '2026-11-04': 10, '2026-11-06': 10 }, act: {} });
  const rhythm = h.api.studyRhythm();
  assert.equal(rhythm.series, 3); assert.equal(rhythm.total, 3);
  h.clock.now = new Date(2026, 10, 15, 12).getTime();
  const paused = h.api.studyRhythm();
  assert.equal(paused.series, 3); assert.equal(paused.paused, true);
  assert.match(paused.message, /Пауза не стирає/);
});

test('Series calculations use calendar days rather than 24-hour assumptions', () => {
  const h = setup();
  assert.equal(h.api.dayNumber('2026-10-26') - h.api.dayNumber('2026-10-25'), 1);
  assert.equal(h.api.dayNumber('2026-03-30') - h.api.dayNumber('2026-03-29'), 1);
});

test('Returning after local midnight refreshes the goal without changing previous-day minutes', () => {
  const h = setup({ days: { '2026-11-08': 25 } });
  assert.equal(h.api.goalProgress().current, 25);
  h.clock.now = new Date(2026, 10, 9, 0, 1).getTime(); h.api.refreshStudyDay();
  assert.equal(h.api.goalProgress().current, 0);
  assert.equal(h.api.state.days['2026-11-08'], 25);
  assert.match(h.nodes.get('main').innerHTML, /9 листопада/);
});

test('Today keeps course notes available and avoids rendering the annual grid', () => {
  const h = setup({ courseNotes: 'Важлива збережена думка' });
  const page = h.nodes.get('main').innerHTML;
  assert.match(page, /Важлива збережена думка/);
  assert.equal([...page.matchAll(/href="#m\d+" aria-label="Модуль/g)].length, 12);
  assert.doesNotMatch(page, /class="activity-cell"/);
  assert.ok(page.length < 20000, 'Today should not generate the large annual heatmap');
});

module.exports = { passed: cases.length + base.passed, stage3Passed: cases.length, cases };
if (require.main === module) console.log(`${base.passed + cases.length} checks passed (${cases.length} stage 3).`);
