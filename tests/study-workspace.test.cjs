'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,legacyState}=require('./stage2.test.cjs');
const KEY='psykholohiia-rik-v1',ID='module-3-m-legacy';
const plain=x=>JSON.parse(JSON.stringify(x));
const setup=(hash='#modules',extra={})=>harness(JSON.stringify(legacyState()),{hash,...extra});
const html=h=>h.nodes.get('main').innerHTML;
function nav(h,hash){h.context.location.hash=hash;h.api.renderPageNavigation()}
function emit(h,type,target,extra={}){for(const fn of h.documentEvents[type]||[])fn({target,preventDefault(){},...extra})}
function click(h,a,extra={}){const target={dataset:{a,...extra},closest(){return this}};emit(h,'click',target)}
function note(h,value,id=ID){emit(h,'input',{id:'study-note',value,dataset:{bind:'resourceNotes',k:id},style:{},classList:{contains:()=>true}})}
function study(h,id=ID,step){nav(h,h.api.studyHref({id},step))}
const state=(h,id=ID)=>h.api.state.resourceStates[id];

test('Modules offer a concrete study action without setup, respecting the last module',()=>{
 const h=setup();assert.equal(h.api.studyCandidate().id,ID);assert.match(html(h),/href="#study\?material=[^" ]+/);assert.equal((html(h).match(/class="module-link"/g)||[]).length,12);
 nav(h,'#m7');nav(h,'#modules');assert.equal(h.api.studyCandidate().module,7);
});
test('Module resource lists have study links and leave material administration to the library',()=>{
 const h=setup('#m3');assert.match(html(h),/#study\?material=module-3-m-legacy/);
 assert.doesNotMatch(html(h),/data-a="resource-status"|data-a="resource-module"|data-a="resource-tags"|data-bind="resourceNotes"|class="module-switcher"/);
 nav(h,'#library');for(const action of ['mat-edit','res-del','resource-module','resource-tags'])assert.ok(html(h).includes('data-a="'+action+'"'),action);
 assert.match(html(h),/Вивчати матеріал/);
});
test('A stable ID selects exactly one source, without the module grid or administrative fields',()=>{
 const h=setup();study(h);assert.equal(h.api.route(),'study');assert.equal(h.api.studyCurrent().id,ID);
 assert.match(html(h),/<h1>Матеріал для перевірки<\/h1>/);assert.equal((html(h).match(/data-resource="/g)||[]).length,1);
 assert.doesNotMatch(html(h),/data-a="mat-edit"|data-a="res-del"|data-a="resource-status"|class="module-switcher"/);
 assert.equal(h.nodes.get('body').classList.contains('study-active'),true);assert.equal(h.nodes.get('mobile-nav').hidden,true);
});
test('Opening a source and scrolling record opening separately and never complete or award learning credit',()=>{
 const h=setup(),id='builtin-media-2-0',before=plain({xp:h.api.state.xp,act:h.api.state.act,topics:h.api.state.topics,done:h.api.state.done});study(h,id);
 assert.ok(state(h,id).openedAt);assert.equal(state(h,id).status,'Заплановано');
 click(h,'resource-open',{k:id});h.context.scrollY=600;h.api.captureStudyView();
 assert.equal(state(h,id).completedAt,undefined);assert.deepEqual(plain({xp:h.api.state.xp,act:h.api.state.act,topics:h.api.state.topics,done:h.api.state.done}),before);
 assert.match(html(h),/target="_blank" rel="noopener noreferrer"/);
});
test('An explicit start stays on the reading step; a second action goes to reflection',()=>{
 const h=setup(),id='builtin-media-2-0';study(h,id);assert.match(html(h),/>Почати<\/button>/);
 click(h,'study-advance',{step:'start'});assert.equal(state(h,id).status,'Вивчаю');assert.equal(h.api.state.studyResume.step,'read');assert.match(html(h),/Продовжити до осмислення/);
 click(h,'study-advance',{step:'reflect'});h.api.renderPageNavigation();assert.equal(h.api.state.studyResume.step,'reflect');assert.equal(state(h,id).completedAt,undefined);
});
test('Reflection is optional and completion happens only through explicit confirmation',()=>{
 const h=setup();study(h,ID,'reflect');assert.match(html(h),/Що найважливішого ти зрозумів/);assert.match(html(h),/необов’язково/);note(h,'');
 study(h,ID,'finish');assert.equal(state(h).status,'Вивчаю');click(h,'study-complete');assert.equal(state(h).status,'Опрацьовано');assert.ok(state(h).completedAt);
 assert.equal(h.nodes.get('recall-dialog').open,false);assert.match(html(h),/Наступний матеріал/);assert.match(html(h),/не є перевіркою засвоєння/);
 const at=state(h).completedAt;h.clock.now+=1000;click(h,'study-complete');assert.equal(state(h).completedAt,at);
});
test('Repeat uses the existing compatible status and does not confer topic mastery or finish a module',()=>{
 const h=setup(),before=plain({topics:h.api.state.topics,mastery:h.api.state.mastery,done:h.api.state.done});study(h,ID,'finish');click(h,'study-repeat');
 assert.equal(state(h).status,'Повернутися');assert.equal(state(h).completedAt,undefined);assert.deepEqual(plain({topics:h.api.state.topics,mastery:h.api.state.mastery,done:h.api.state.done}),before);
 nav(h,'#modules');assert.match(html(h),/Потрібно повторити/);assert.match(html(h),/#study\?material=module-3-m-legacy/);
});
test('Completion controls cannot finish a different route or an earlier step',()=>{
 const h=setup();assert.equal(h.api.studyAction('study-complete'),false);study(h);assert.equal(h.api.studyAction('study-complete'),false);assert.equal(state(h).status,'Вивчаю');
 study(h,'does-not-exist','finish');assert.equal(h.api.studyAction('study-complete'),false);
});
test('Previous and next follow module, attached-source and topic order with stable IDs',()=>{
 const h=setup(),seq=h.api.studySequence(false),attached=seq.findIndex(r=>r.id===ID),topic=seq.findIndex(r=>r.id==='topic-3-2-t-legacy');assert.ok(attached<topic);
 for(const i of [0,attached,topic,seq.length-1]){study(h,seq[i].id,'finish');if(i)assert.ok(html(h).includes(h.api.studyHref(seq[i-1])));if(i+1<seq.length)assert.ok(html(h).includes(h.api.studyHref(seq[i+1])))}
 const last=seq.filter(r=>r.module===3).at(-1);study(h,last.id,'finish');assert.match(html(h),/Модуль 4 ·/);assert.match(html(h),/material=builtin-media-4-0/);
 study(h,seq.at(-1).id,'finish');assert.match(html(h),/останній доступний матеріал/);
});
test('Two resources sharing a title still open by their exact IDs',()=>{
 const h=setup(),r=h.api.allResources().find(r=>r.id===ID),other=h.api.allResources().find(r=>r.module===3&&r.id!==ID);h.api.state.library[other.id].title=r.title;
 study(h,other.id);assert.equal(h.api.studyCurrent().id,other.id);assert.match(html(h),new RegExp('data-resource="'+other.id+'"'));
});
test('Missing, hidden and malicious IDs have a safe exit and preserve orphan notes',()=>{
 const h=setup();h.api.setMaterialHidden(ID,true);study(h);assert.match(html(h),/Матеріал недоступний/);assert.equal(state(h).note,'Моя особиста нотатка');assert.match(html(h),/href="#modules"/);
 study(h,'<img src=x onerror=evil>');assert.doesNotMatch(html(h),/<img|onerror=evil/);assert.match(html(h),/Матеріал недоступний/);
 nav(h,'#modules');assert.notEqual(h.api.studyCandidate().id,ID);
});
test('Typing autosaves in the existing resource note without redrawing the active input',()=>{
 const h=setup();study(h);const before=html(h),value='Незавершена думка <script> & апостроф’';note(h,value);
 assert.equal(html(h),before);assert.equal(state(h).note,value);assert.equal(JSON.parse(h.storage.get(KEY)).resourceStates[ID].note,value);
 assert.deepEqual(Object.keys(h.api.state.toolDrafts),[]);assert.equal(h.storage.size,1);
});
test('Notes survive all steps, previous/next, the library and reload without duplication',()=>{
 const h=setup();study(h);note(h,'Мій висновок');study(h,ID,'reflect');assert.match(html(h),/Мій висновок/);study(h,ID,'finish');assert.match(html(h),/Мій висновок/);
 const next=h.api.studySequence(false).find(r=>r.id!==ID);study(h,next.id);study(h);assert.equal(state(h).note,'Мій висновок');nav(h,'#library?material='+ID);assert.match(html(h),/Мій висновок/);
 const re=harness(h.storage.get(KEY),{hash:h.api.studyHref({id:ID})});assert.equal(state(re).note,'Мій висновок');
});
test('Current step, scroll position and unfinished note survive a cold reload and the continue action',()=>{
 const h=setup();study(h,ID,'reflect');note(h,'Незавершений текст');h.context.scrollY=357;
 for(const fn of h.windowEvents.pagehide)fn({});let re=harness(h.storage.get(KEY),{hash:'#study?material='+ID});
 assert.equal(re.api.state.studyResume.step,'reflect');assert.equal(re.context.scrollY,357);assert.equal(state(re).note,'Незавершений текст');
 nav(re,'#modules');assert.match(html(re),/Продовжити з місця зупинки/);assert.match(html(re),/Осмислення/);study(re);assert.equal(re.api.state.studyResume.step,'reflect');assert.equal(re.context.scrollY,357);
});
test('Changing steps resets the step position, and switching materials never inherits another step',()=>{
 const h=setup();study(h,ID,'reflect');h.context.scrollY=250;study(h,ID,'finish');assert.equal(h.context.scrollY,0);
 h.context.scrollY=510;study(h,'builtin-media-3-0');assert.equal(h.api.state.studyResume.step,'read');assert.equal(h.context.scrollY,0);
});
test('Reading module positions remain separate and unchanged when studying a resource',()=>{
 const h=setup();h.api.saveModuleView(3,{scrollY:700,anchor:'panel:notes',offset:0,panels:['notes'],resources:[]});const before=plain(h.api.state.moduleViews);
 study(h);h.context.scrollY=320;h.api.captureStudyView();assert.deepEqual(plain(h.api.state.moduleViews),before);
});
test('Old backup import preserves all legacy progress, notes, IDs and unknown fields',()=>{
 const h=setup(),old=legacyState(),decoded=h.api.decodeBackup(JSON.stringify(old));assert.equal(h.api.applyBackup(decoded),true);
 for(const key of ['topics','notes','resourceStates','cards','materials','topicMaterials','days','done','_legacyMetadata'])assert.deepEqual(plain(h.api.state[key]),old[key],key);
 study(h);assert.equal(state(h).status,'Вивчаю');assert.equal(state(h).note,old.resourceStates[ID].note);assert.equal(h.api.state.v,1);assert.equal(h.api.state.studyResume.step,'read');
});
test('New backups round-trip the current position and use only the existing note storage',()=>{
 const h=setup();study(h,ID,'reflect');note(h,'Резервна думка');h.context.scrollY=142;const data=h.api.decodeBackup(JSON.stringify(h.api.createBackup())),other=setup();
 assert.equal(data.studyResume.scrollY,142);assert.equal(other.api.applyBackup(data),true);study(other);assert.equal(other.context.scrollY,142);assert.equal(state(other).note,'Резервна думка');
 assert.equal(data.studyResume.note,undefined);assert.equal(data.studyResume.draft,undefined);
});
test('Pre-import backup includes current note and position and old pending capture cannot leak into imported data',()=>{
 const h=setup();study(h,ID,'reflect');note(h,'До імпорту');h.context.scrollY=231;h.api.applyBackup(h.api.decodeBackup(JSON.stringify(legacyState())));
 const prior=JSON.parse(h.storage.get(KEY+'-pre-import'));assert.equal(prior.studyResume.scrollY,231);assert.equal(prior.resourceStates[ID].note,'До імпорту');h.api.captureStudyView();assert.equal(state(h).note,'Моя особиста нотатка');
});
for(const status of ['Заплановано','Вивчаю','Опрацьовано','Повернутися','Історичний статус'])test('Merely opening preserves legacy status '+status,()=>{
 const old=legacyState();old.resourceStates[ID]={status,note:'Історична нотатка',updatedAt:123,future:{keep:true}};const h=harness(JSON.stringify(old),{hash:'#study?material='+ID});
 assert.equal(state(h).status,status);assert.equal(state(h).note,'Історична нотатка');assert.equal(state(h).updatedAt,123);assert.equal(state(h).completedAt,undefined);assert.deepEqual(plain(state(h).future),{keep:true});
});
test('A storage conflict leaves the other tab untouched and the current note exportable',()=>{
 const h=setup();study(h);const external=JSON.stringify({...legacyState(),otherTab:true});h.storage.set(KEY,external);note(h,'Моя чернетка');assert.equal(h.api.blocked,true);assert.equal(h.storage.get(KEY),external);
 assert.equal(h.api.createBackup().state.resourceStates[ID].note,'Моя чернетка');assert.match(h.api.error,/іншій вкладці/);
});
test('Quota errors retain the note in memory and display the existing storage warning',()=>{
 const h=setup('#study?material='+ID,{failWrites:true});note(h,'Важлива думка');assert.match(h.api.error,/Не вдалося записати/);assert.equal(h.api.createBackup().state.resourceStates[ID].note,'Важлива думка');
});
test('YouTube search is identified honestly and does not create a player or finish progress',()=>{
 const h=setup(),r=h.api.allResources().find(r=>r.url.includes('youtube.com/results'));assert.ok(r);study(h,r.id);
 assert.match(html(h),/Пошук на YouTube/);assert.match(html(h),/Конкретну лекцію потрібно обрати/);assert.doesNotMatch(html(h),/<iframe/);click(h,'resource-open',{k:r.id});assert.notEqual(state(h,r.id).status,'Опрацьовано');
});
test('A specific YouTube video reuses explicit player loading and never auto-completes',()=>{
 const h=setup(),r=h.api.allResources().find(r=>h.api.youtubeInfo(r.url));study(h,r.id);assert.match(html(h),/data-a="youtube-load"/);assert.doesNotMatch(html(h),/<iframe/);
 const box={dataset:{},innerHTML:''};h.nodes.get('resource:'+r.id).querySelector=()=>box;click(h,'youtube-load',{k:r.id});assert.match(box.innerHTML,/<iframe/);assert.notEqual(state(h,r.id).status,'Опрацьовано');
});
test('Offline study keeps local context and notes available without fetching replacement content',()=>{
 const h=setup('#study?material='+ID,{navigator:{onLine:false}});assert.match(html(h),/https:\/\/example.com\/reading/);note(h,'Офлайн');assert.equal(state(h).note,'Офлайн');
 assert.doesNotMatch(html(h),/<iframe/);assert.equal(state(h).status,'Вивчаю');
});
for(const [type,url] of [['Стаття','https://example.com/article'],['Книга','https://example.com/book'],['Лекція','https://example.com/lecture'],['Інше','https://example.com/file.pdf']])test(type+' has a concrete external source without invented internal text',()=>{
 const h=setup(),r=h.api.upsertMaterial({title:type,url,type,module:3});study(h,r.id);assert.ok(html(h).includes(url));assert.match(html(h),/Відкрити джерело/);assert.equal(state(h,r.id).status,'Заплановано');if(url.endsWith('.pdf'))assert.match(html(h),/PDF · зовнішнє джерело/);
});
test('Existing internal text, descriptions and notes are escaped, and resources without URLs work',()=>{
 const h=setup();Object.assign(h.api.state.library[ID],{text:'Текст <img src=x onerror=evil>',desc:'Опис <script>evil</script>',url:''});state(h).note='<script>note</script>';study(h);
 assert.match(html(h),/Текст &lt;img/);assert.match(html(h),/Опис &lt;script/);assert.doesNotMatch(html(h),/<img src=x|<script>evil/);assert.doesNotMatch(html(h),/Відкрити джерело/);
});
test('Inbox material study has no module zero and returns to the library',()=>{
 const h=setup(),r=h.api.upsertMaterial({title:'Вхідний',url:'https://example.com/inbox',type:'Інше',module:0});study(h,r.id);assert.match(html(h),/Бібліотека \/ Матеріал/);assert.doesNotMatch(html(h),/Модуль 0|#m0/);assert.match(html(h),/До бібліотеки/);
 nav(h,'#overview');assert.ok(html(h).includes(h.api.studyHref(r)));
});
test('Reading preferences are reused and academic data is isolated from study actions',()=>{
 const h=setup(),before=plain(h.api.state.academic);study(h,ID,'finish');h.api.changeReading('enabled',true);h.api.changeReading('size',22);click(h,'study-complete');note(h,'Звичайна програма');
 assert.equal(h.nodes.get('body').classList.contains('reading-enabled'),true);assert.deepEqual(plain(h.api.state.academic),before);
 nav(h,'#academic');assert.equal(h.api.route(),'academic');assert.equal(h.nodes.get('body').classList.contains('study-active'),false);assert.equal(h.nodes.get('mobile-nav').hidden,false);assert.match(html(h),/Перший академічний рік/);
});
test('Feynman, cards, notes, sessions, timer and reading remain contextual',()=>{
 const h=setup();study(h);assert.doesNotMatch(html(h),/Пояснити своїми словами · Фейнман|Створити картку/);assert.match(html(h),/<details class="study-tools"><summary>Додаткові інструменти/);
 study(h,ID,'reflect');for(const fragment of ['#feynman?resource='+ID,'data-a="card-new"','#m3?notes=1','#sessions','#week','data-a="learn-reading"'])assert.ok(html(h).includes(fragment),fragment);
 study(h,ID,'finish');assert.match(html(h),/#review\?module=3/);click(h,'card-new',{k:ID});assert.equal(h.nodes.get('card-dialog').open,true);assert.match(h.nodes.get('card-dialog').innerHTML,/Матеріал для перевірки/);
});
test('PWA update and auth preparation capture position through existing save guards',()=>{
 const h=setup();study(h);h.context.scrollY=117;assert.equal(h.context.RikStudy.prepareAuthRedirect(),true);assert.equal(JSON.parse(h.storage.get(KEY)).studyResume.scrollY,117);
 const sent=[];h.api.pwaReg={waiting:{postMessage:m=>sent.push(m)}};h.context.scrollY=218;assert.equal(h.api.applyPWAUpdate(),true);assert.equal(sent.length,1);assert.equal(JSON.parse(h.storage.get(KEY)).studyResume.scrollY,218);
});
test('Safe keyboard exit and visibility changes preserve state without completion',()=>{
 const h=setup();study(h,ID,'reflect');note(h,'Перед виходом');h.context.scrollY=203;h.context.document.visibilityState='hidden';emit(h,'visibilitychange',{});
 assert.equal(JSON.parse(h.storage.get(KEY)).studyResume.scrollY,203);emit(h,'keydown',{tagName:'DIV'},{key:'Escape'});assert.equal(h.context.location.hash,'#m3');h.api.renderPageNavigation();
 assert.equal(h.nodes.get('body').classList.contains('study-active'),false);assert.equal(state(h).status,'Вивчаю');assert.equal(state(h).note,'Перед виходом');study(h);assert.equal(h.api.state.studyResume.step,'reflect');
});
test('Exactly one step is current and the note has a label on every study step',()=>{
 const h=setup();for(const step of ['read','reflect','finish']){study(h,ID,step);assert.equal((html(h).match(/aria-current="step"/g)||[]).length,1);assert.match(html(h),/for="study-note"/);assert.match(html(h),/aria-label="Навігація між матеріалами"/)}
});
test('Invalid added position fields are rejected before backup import',()=>{
 const h=setup();for(const patch of [{step:'bad'},{scrollY:-1},{scrollY:'123'}]){const old=legacyState();old.studyResume={module:3,resourceId:ID,...patch};assert.throws(()=>h.api.decodeBackup(JSON.stringify(old)))}
 const old=legacyState();old.resourceStates[ID].openedAt=-1;assert.throws(()=>h.api.decodeBackup(JSON.stringify(old)));
});
test('Search, record source links and learning sessions lead into the same study space',()=>{
 const h=setup(),hit=h.api.commandMatches('Матеріал для перевірки').find(x=>x.target==='study?material='+ID);assert.ok(hit);nav(h,'#'+hit.target);assert.equal(h.api.studyCurrent().id,ID);
 nav(h,'#sessions');assert.match(html(h),/#study\?material=module-3-m-legacy/);assert.equal(h.api.startLearningSession(15),true);assert.match(h.context.location.hash,/#study\?material=module-3-m-legacy/);h.api.renderPageNavigation();
 assert.equal(h.api.state.learningSession.status,'active');assert.match(html(h),/<details class="study-tools">[\s\S]*Поточна навчальна сесія/);
});
test('Moving a studied material keeps the active step, note and new module on resume',()=>{
 const h=setup();study(h,ID,'reflect');note(h,'Після перенесення');nav(h,'#library');assert.equal(h.api.attachMaterial(ID,5,''),true);study(h);
 assert.equal(h.api.state.studyResume.module,5);assert.equal(h.api.state.studyResume.step,'reflect');assert.equal(state(h).note,'Після перенесення');assert.match(html(h),/Модуль 5 \/ Матеріал/);
});
