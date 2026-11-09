'use strict';
// Run: node tests/stage6.test.cjs. No network, browser or personal storage is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const previous = require('./stage5.test.cjs');
const { harness, legacyState } = require('./stage2.test.cjs');
const KEY = 'psykholohiia-rik-v1';
const cases = [];
function test(name, run) { run(); cases.push(name); }
const raw = () => JSON.stringify(legacyState());
const setup = options => harness(raw(), options);
const minutes = h => +h.api.state.days[h.api.iso(new Date(h.clock.now))] || 0;
const json = value => JSON.parse(JSON.stringify(value));

for (const theme of ['system', 'light', 'dark']) {
  test('Theme ' + theme + ' persists without learning activity or draft loss', () => {
    const h = setup({dark:true}), before = json(h.api.state.act), main = h.nodes.get('main').innerHTML;
    assert.equal(h.api.setTheme(theme), true);
    assert.equal(h.api.state.theme, theme);
    assert.deepEqual(json(h.api.state.act), before);
    assert.equal(h.nodes.get('main').innerHTML, main);
    const fresh = harness(h.storage.get(KEY));
    assert.equal(fresh.api.state.theme, theme);
    assert.equal(fresh.nodes.get('html').getAttribute('data-theme') || null, theme === 'system' ? null : theme);
  });
}
test('Invalid theme is rejected and old backups default to system', () => {
  const h = setup(); assert.equal(h.api.state.theme, 'system');
  assert.equal(h.api.setTheme('neon'),false);
  assert.throws(() => h.api.decodeBackup(JSON.stringify({...legacyState(),theme:'neon'})));
});
test('Background tab cannot overwrite newer device data', () => {
  const h = setup(), other = JSON.stringify({...legacyState(),notes:{3:'Інша вкладка'}});
  h.storage.set(KEY,other); h.api.state.notes[3]='Моя незбережена нотатка';
  assert.equal(h.api.saveLocal(),false); assert.equal(h.api.blocked,true);
  assert.equal(h.storage.get(KEY),other); assert.match(h.api.error,/іншій вкладці/);
  assert.equal(h.api.createBackup().state.notes[3],'Моя незбережена нотатка');
  assert.equal(h.api.applyBackup(legacyState()),false); assert.equal(h.storage.get(KEY),other);
});
test('Storage event blocks writes, including storage clear', () => {
  const h = setup(); h.windowEvents.storage[0]({key:null});
  assert.equal(h.api.blocked,true);assert.equal(h.api.saveLocal(),false);
});
test('Paused timer survives reload without crediting paused time', () => {
  const h = setup();h.api.startShortSession();h.clock.now+=125000;h.api.timerAction('tm-pause');
  const reopened=harness(h.storage.get(KEY),{now:h.clock.now+3600000});
  assert.equal(reopened.api.timer.left,475); assert.equal(reopened.api.timer.running,false);
  assert.equal(minutes(reopened),0);reopened.api.timerAction('tm-credit');assert.equal(minutes(reopened),2);
});
test('Running timer resumes from wall clock after reload', () => {
  const h = setup();h.api.startShortSession();
  const reopened=harness(h.storage.get(KEY),{now:h.clock.now+180000});
  assert.equal(reopened.api.timer.running,true);assert.equal(reopened.api.timer.left,420);
  reopened.api.timerAction('tm-credit');assert.equal(minutes(reopened),3);
});
test('Expired timer credits exactly once across repeated reloads', () => {
  const h = setup();h.api.startShortSession();
  const reopened=harness(h.storage.get(KEY),{now:h.clock.now+900000});
  assert.equal(minutes(reopened),10);assert.equal(reopened.api.timer.done,true);
  const again=harness(reopened.storage.get(KEY),{now:h.clock.now+1800000});
  assert.equal(minutes(again),10);again.api.timerTick();assert.equal(minutes(again),10);
});
test('Focus reset preserves only elapsed full minutes', () => {
  const h=setup();h.api.focusAction('focus-start');h.clock.now+=185000;
  h.api.focusAction('focus-reset');assert.equal(minutes(h),3);assert.equal(h.api.focus.left,1500);
  h.api.focusAction('focus-reset');assert.equal(minutes(h),3);
});
test('Focus completion survives reload and never credits break time', () => {
  const h=setup();h.api.focusAction('focus-start');
  const reopened=harness(h.storage.get(KEY),{now:h.clock.now+1501000});
  assert.equal(minutes(reopened),25);assert.equal(reopened.api.focus.phase,'break');
  reopened.api.focusAction('focus-start');reopened.clock.now+=310000;reopened.api.focusTick();
  assert.equal(minutes(reopened),25);assert.equal(reopened.api.focus.phase,'focus');
  const again=harness(reopened.storage.get(KEY),{now:reopened.clock.now+500000});assert.equal(minutes(again),25);
});
test('Paused focus resumes after reload without counting absence', () => {
  const h=setup();h.api.focusAction('focus-start');h.clock.now+=120000;h.api.focusAction('focus-pause');
  const reopened=harness(h.storage.get(KEY),{now:h.clock.now+600000});
  assert.equal(reopened.api.focus.left,1380);assert.equal(reopened.api.focus.running,false);
  reopened.api.focusAction('focus-skip');assert.equal(minutes(reopened),2);
});
test('Malformed timer snapshot cannot start an invalid timer', () => {
  const s=legacyState();s.timerState={version:1,study:{dur:-1,left:500,running:true,endAt:0}};
  const h=harness(JSON.stringify(s));assert.equal(h.api.timer.running,false);assert.equal(h.api.timer.dur,1500);
});
test('Import stops former timer and restores imported theme', () => {
  const h=setup();h.api.startShortSession();const candidate=legacyState();candidate.theme='dark';
  assert.equal(h.api.applyBackup(candidate),true);assert.equal(h.api.timer.running,false);
  assert.equal(h.nodes.get('html').getAttribute('data-theme'),'dark');
  assert.equal(JSON.parse(h.storage.get(KEY+'-pre-import')).timerState.study.running,true);
});
test('Explicit app update saves current state before messaging worker', () => {
  const h=setup(), sent=[];h.api.pwaReg={waiting:{postMessage:m=>sent.push(m)}};
  h.api.startShortSession();assert.equal(h.api.applyPWAUpdate(),true);
  assert.equal(h.api.pwaUpdating,true);assert.deepEqual(json(sent),[{type:'APPLY_UPDATE'}]);
  assert.equal(JSON.parse(h.storage.get(KEY)).timerState.study.running,true);
});
test('App update refuses unsaved drafts and unavailable storage', () => {
  const h=setup(), sent=[];h.api.pwaReg={waiting:{postMessage:m=>sent.push(m)}};
  const original=h.context.document.querySelectorAll;
  h.context.document.querySelectorAll=q=>q.startsWith('form ')?[{tagName:'INPUT',type:'text',dataset:{},value:'Нова нотатка',defaultValue:''}]:original(q);
  assert.equal(h.api.applyPWAUpdate(),false);assert.equal(sent.length,0);
  const blocked=setup({failWrites:true});blocked.api.pwaReg=h.api.pwaReg;
  assert.equal(blocked.api.applyPWAUpdate(),false);assert.equal(sent.length,0);
});
test('Default select and closed forms do not block updating', () => {
  const h=setup();h.context.document.querySelectorAll=()=>[
    {tagName:'SELECT',dataset:{},options:[{selected:true,defaultSelected:false,disabled:false}],selectedIndex:0},
    {tagName:'INPUT',dataset:{},value:'draft',defaultValue:'',closest:()=>({})}
  ];assert.equal(h.api.hasUnsavedDraft(),false);
});
test('App registration waits for explicit update and has no remote requests', () => {
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.equal((html.match(/<head>/g)||[]).length,1);assert.equal((html.match(/<body>/g)||[]).length,1);
  assert.ok(html.indexOf('<title>')<html.indexOf('</head>'));
  assert.ok(html.indexOf('<a class="skip-link"')>html.indexOf('<body>'));
  assert.doesNotMatch(html,/<(?:link|script|img|iframe)\b[^>]*(?:src|href)="https?:/i);
  assert.doesNotMatch(html,/WORKER_SOURCE|claude\.use|fonts\.google/);
  assert.match(html,/updateViaCache:'none'/);assert.match(html,/if\(PWA_UPDATING\)\{location.reload/);
});
test('PWA manifest has real local icons and stable scope',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','manifest.webmanifest')));
  assert.equal(manifest.id,'./');assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./');
  for(const size of [192,512]){
    const icon=manifest.icons.find(x=>x.sizes===`${size}x${size}`);assert.ok(icon);
    const data=fs.readFileSync(path.join(__dirname,'..',icon.src));
    assert.equal(data.toString('hex',0,8),'89504e470d0a1a0a');
    assert.equal(data.readUInt32BE(16),size);assert.equal(data.readUInt32BE(20),size);
  }
});
function contrast(a,b){const lum=x=>{const c=x.match(/\w\w/g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722};return (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05)}
test('Both theme palettes meet text and control contrast',()=>{
  for(const p of [
    {surface:'FFFFFF',ink:'1F2328',secondary:'5B6470',accent:'2F5D62',onAccent:'FFFFFF',danger:'A33A2B',border:'8A867D'},
    {surface:'1E2124',ink:'E8E6E1',secondary:'A3A9B0',accent:'8FBFC2',onAccent:'10201E',danger:'F5A89B',border:'6F7983'}
  ]){for(const key of ['ink','secondary','danger'])assert.ok(contrast(p[key],p.surface)>=4.5,key);assert.ok(contrast(p.accent,p.onAccent)>=4.5);assert.ok(contrast(p.border,p.surface)>=3)}
});

function workerHarness({active=true,failAsset=false,scope='https://local.test/'}={}) {
  const events={}, stores=new Map(),deleted=[],network=[];let skip=0,claimed=0;
  const key=x=>typeof x==='string'?x:x.url;
  const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const map=stores.get(name);return {async put(k,v){map.set(key(k),v.clone())},async match(k){return map.get(key(k))?.clone()}}},async keys(){return [...stores.keys()]},async delete(k){deleted.push(k);return stores.delete(k)}};
  const self={registration:{scope,active:active?{}:null},clients:{async claim(){claimed++}},async skipWaiting(){skip++},addEventListener:(name,fn)=>events[name]=fn};
  const context={self,caches,URL,Request,fetch:async request=>{network.push(key(request));return new Response(key(request).endsWith('index.html')?'APP-SHELL':'asset',{status:failAsset&&key(request).endsWith('icon-512.png')?404:200})}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','service-worker.js'),'utf8'),context);
  async function emit(name,props={}){let task;events[name]({...props,waitUntil:p=>task=p,respondWith:p=>task=p});return task===undefined?undefined:await task}
  return {events,stores,deleted,network,emit,get skip(){return skip},get claimed(){return claimed}};
}
async function runWorkerTests(){
 const asyncTest=async(name,run)=>{await run();cases.push(name)};
 await asyncTest('Registration exposes waiting update and reloads only on request',async()=>{
   const handlers={},sent=[],reg={waiting:{postMessage:m=>sent.push(m)},addEventListener:(n,fn)=>handlers[n]=fn};
   const sw={controller:{},ready:Promise.resolve(reg),addEventListener:(n,fn)=>handlers[n]=fn,register(url,options){assert.equal(url,'./service-worker.js');assert.equal(options.updateViaCache,'none');return Promise.resolve(reg)}};
   const h=setup({navigator:{serviceWorker:sw}});await Promise.resolve();await Promise.resolve();
   assert.equal(h.api.pwaReg,reg);handlers.controllerchange();assert.equal(h.context.reloaded,undefined);
   assert.equal(h.api.applyPWAUpdate(),true);handlers.controllerchange();assert.equal(h.context.reloaded,true);
   assert.equal(sent.length,1);
 });
 await asyncTest('First installation preloads study and bundled auth assets then activates',async()=>{const w=workerHarness({active:false});await w.emit('install');assert.equal(w.skip,1);const store=w.stores.values().next().value;assert.equal(store.size,6);assert.ok([...store.keys()].some(k=>k.endsWith('/auth.js')));assert.ok([...store.keys()].some(k=>k.endsWith('/runtime-config.js')))});
 await asyncTest('Update installation waits until explicit message',async()=>{const w=workerHarness();await w.emit('install');assert.equal(w.skip,0);await w.emit('message',{data:{type:'OTHER'}});assert.equal(w.skip,0);await w.emit('message',{data:{type:'APPLY_UPDATE'}});assert.equal(w.skip,1)});
 await asyncTest('Failed shell download keeps previous cache intact',async()=>{const w=workerHarness({failAsset:true});w.stores.set('rik-psykholohii:%2F:shell-old',new Map([['old','saved']]));await assert.rejects(w.emit('install'),/Incomplete/);assert.equal(w.skip,0);assert.equal(w.stores.size,1);assert.equal(w.stores.values().next().value.get('old'),'saved')});
 await asyncTest('Activation deletes only own caches and known legacy names',async()=>{const w=workerHarness();await w.emit('install');for(const k of ['rik-psykholohii:%2F:shell-old','unrelated-app','rik-psykholohii:%2Fother%2F:shell-old','rik-psykholohii-offline-v2'])w.stores.set(k,new Map());await w.emit('activate');assert.ok(w.deleted.includes('rik-psykholohii:%2F:shell-old'));assert.ok(w.deleted.includes('rik-psykholohii-offline-v2'));assert.ok(w.stores.has('unrelated-app'));assert.ok(w.stores.has('rik-psykholohii:%2Fother%2F:shell-old'));assert.equal(w.claimed,1)});
 await asyncTest('Offline navigation serves cached shell without waiting for network',async()=>{const w=workerHarness();await w.emit('install');const before=w.network.length;const res=await w.emit('fetch',{request:{url:'https://local.test/?launch=1',mode:'navigate',method:'GET'}});assert.equal(await res.text(),'APP-SHELL');assert.equal(w.network.length,before)});
 await asyncTest('Worker ignores YouTube, foreign scope, POST and unrelated assets',async()=>{const w=workerHarness({scope:'https://local.test/tracker/'});for(const request of [{url:'https://youtube.com/embed/a',mode:'no-cors',method:'GET'},{url:'https://local.test/elsewhere/',mode:'navigate',method:'GET'},{url:'https://local.test/tracker/',mode:'navigate',method:'POST'},{url:'https://local.test/tracker/custom.json',method:'GET'}])assert.equal(await w.emit('fetch',{request}),undefined)});
 return {passed:previous.passed+cases.length,stage6Passed:cases.length,cases};
}
module.exports={run:runWorkerTests,cases};
if(require.main===module)runWorkerTests().then(r=>console.log(`${r.passed} checks passed (${r.stage6Passed} stage 6).`)).catch(e=>{console.error(e);process.exitCode=1});
