'use strict';
// node tests/learning-tools.test.cjs — includes every earlier stage and SW checks.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const previous=require('./stage6.test.cjs');
const {harness,legacyState}=require('./stage2.test.cjs');
const KEY='psykholohiia-rik-v1';
const cases=[];
const test=(name,run)=>{run();cases.push(name)};
const plain=x=>JSON.parse(JSON.stringify(x));
const setup=options=>harness(JSON.stringify(legacyState()),options);
const minutes=h=>+h.api.state.days[h.api.iso(new Date(h.clock.now))]||0;
function emit(h,type,target,extra={}){for(const fn of h.documentEvents[type]||[])fn({target,preventDefault(){},...extra})}
function save(h,type,data,id=''){return h.api.saveTool(type,id,data)}

test('Old profile keeps every original field, IDs, analytics and unknown data',()=>{
 const old=legacyState(),h=setup();for(const k of Object.keys(old))assert.deepEqual(plain(h.api.state[k]),old[k],k);
 assert.equal(h.storage.get(KEY),JSON.stringify(old));assert.equal(h.api.state.v,1);
 for(const k of ['ideas','journal','feynman','experimentResults'])assert.deepEqual(plain(h.api.state[k]),[]);
 assert.equal(h.api.state.reading.width,70);assert.equal(h.api.state.explanationLevel,'standard');
});
test('Partial reading settings get safe defaults without dropping unknown fields',()=>{
 const s=legacyState();s.reading={enabled:true,future:'keep'};const h=harness(JSON.stringify(s));
 assert.equal(h.api.state.reading.size,18);assert.equal(h.api.state.reading.future,'keep');
});
for(const type of ['ideas','journal','feynman','research','concepts']){
 test(type+' draft survives reload and JSON roundtrip without adding a finished record',()=>{
  const h=setup(),field={ideas:'text',journal:'understood',feynman:'explanation',research:'sample',concepts:'note'}[type];
  const before=h.api.state[type].length;assert.equal(h.api.writeToolDraft(type,'',field,"Моя пам’ять <script> & '"),true);
  const re=harness(h.storage.get(KEY));assert.equal(re.api.state[type].length,before);
  assert.equal(re.api.state.toolDrafts[type+':new'][field],"Моя пам’ять <script> & '");
  const imported=setup();assert.equal(imported.api.applyBackup(h.api.decodeBackup(JSON.stringify(h.api.createBackup()))),true);
  assert.equal(imported.api.state.toolDrafts[type+':new'][field],"Моя пам’ять <script> & '");
 });
}
test('Draft and record do not touch learning time, XP or activity',()=>{
 const h=setup(),act=plain(h.api.state.act),xp=h.api.state.xp;h.api.writeToolDraft('ideas','','text','Думка');save(h,'ideas',{text:'Думка'});
 assert.deepEqual(plain(h.api.state.act),act);assert.equal(h.api.state.xp,xp);assert.equal(minutes(h),0);
});
test('Typed draft remains in memory and original stays safe on storage conflict',()=>{
 const h=setup(),other=JSON.stringify({...legacyState(),courseNotes:'Інша вкладка'});h.storage.set(KEY,other);
 assert.equal(h.api.writeToolDraft('ideas','','text','Моя думка'),false);assert.equal(h.api.blocked,true);assert.equal(h.storage.get(KEY),other);
 assert.equal(h.api.createBackup().state.toolDrafts['ideas:new'].text,'Моя думка');
});
test('Invalid nested learning state is rejected without replacing the current profile',()=>{
 const bad=[{ideas:[{id:'i',text:7}]},{journal:[{id:'j',date:'2026-02-30'}]},{feynman:[{id:'f',title:'Тема',history:[{revised:4,at:1}]}]},{experimentResults:[{id:'e',kind:'stroop',rows:[{ms:-1,correct:true,congruent:true}]}]},{caseAnalysis:{c:{missing:[]}}},{toolDrafts:{'ideas:new':{text:{}}}},{criticalProgress:{c:{choice:9}}},{explanationLevel:'ai'},{reading:{width:-1}},{learningSession:{status:'bad'}}];
 for(const fields of bad){const h=setup(),before=h.storage.get(KEY);assert.throws(()=>h.api.decodeBackup(JSON.stringify({...legacyState(),...fields})));assert.equal(h.storage.get(KEY),before)}
});
test('A single input event saves a draft without replacing the active form',()=>{
 const h=setup({hash:'#ideas'}),main=h.nodes.get('main').innerHTML;
 const form={dataset:{tool:'ideas',edit:''},querySelector:()=>null};const input={id:'',dataset:{toolField:'text'},type:'textarea',value:'Введена думка',closest:()=>form};
 emit(h,'input',input);assert.equal(h.api.state.toolDrafts['ideas:new'].text,'Введена думка');assert.equal(h.nodes.get('main').innerHTML,main);
});
test('Saving idea supports edit, optional module/tags, deletion and existing unknown properties',()=>{
 const h=setup();const x=save(h,'ideas',{text:'Перша думка',module:3,tags:'пам’ять, увага',date:'2026-11-09',future:'keep'});
 h.api.writeToolDraft('ideas',x.id,'text','Оновлено');const y=save(h,'ideas',{text:'Оновлено'},x.id);
 assert.equal(y.id,x.id);assert.equal(y.future,'keep');assert.equal(y.module,3);assert.equal(h.api.state.ideas.length,1);
 assert.equal(h.api.state.toolDrafts['ideas:'+x.id],undefined);h.api.learningDelete('ideas',x.id);assert.equal(h.api.state.ideas.length,0);
});
test('Idea-to-note conversion appends once and preserves the idea and existing notes',()=>{
 const h=setup();const x=save(h,'ideas',{text:'Додаток',module:3,date:'2026-11-09'});
 assert.equal(h.api.ideaToNote(x.id),true);const first=h.api.state.notes[3];assert.match(first,/Збережена нотатка/);assert.match(first,/Додаток/);
 assert.equal(h.api.ideaToNote(x.id),false);assert.equal(h.api.state.notes[3],first);assert.equal(h.api.state.ideas.length,1);
 const y=save(h,'ideas',{text:'До курсу'});h.api.ideaToNote(y.id);assert.match(h.api.state.courseNotes,/Мій курс/);assert.match(h.api.state.courseNotes,/До курсу/);
});
test('Ideas and Feynman can prepare a card for user editing',()=>{
 const h=setup();const x=save(h,'ideas',{text:'Думка',module:3});h.api.learningCard('ideas',x.id);
 assert.equal(h.nodes.get('card-dialog').open,true);assert.equal(h.nodes.get('card-back').value,'Думка');
});
test('Journal validates date, stores all three prompts and filters by calendar date',()=>{
 const h=setup();const x=save(h,'journal',{date:'2026-11-09',understood:'Реконструкція',difficulty:'Контекст',repeat:'Метод',module:2});
 assert.throws(()=>save(h,'journal',{date:'2026-02-30',understood:'a'}));assert.throws(()=>save(h,'journal',{date:'2026-11-09'}));
 h.context.location.hash='#journal?date=2026-11-09';assert.match(h.api.vLearningRecords('journal'),/Реконструкція/);
 h.context.location.hash='#journal?date=2026-11-08';assert.doesNotMatch(h.api.vLearningRecords('journal'),/data-tool-entry=/);
 save(h,'journal',{repeat:'Інтерференція'},x.id);assert.equal(h.api.state.journal[0].understood,'Реконструкція');
});
test('Feynman stores source/topic, checks and successive final versions without duplicate history',()=>{
 const h=setup();let x=save(h,'feynman',{title:'Пам’ять',module:2,topicKey:'2-1',explanation:'Своїми словами',example:'Приклад',gaps:'Питання',revised:'Версія 1',needsCheck:true,clear:true});
 x=save(h,'feynman',{revised:'Версія 2'},x.id);x=save(h,'feynman',{gaps:'Уточнено'},x.id);
 assert.equal(x.history.length,2);assert.equal(x.history[0].revised,'Версія 1');assert.equal(x.needsCheck,true);assert.equal(x.clear,true);
 const re=harness(h.storage.get(KEY));assert.equal(re.api.state.feynman[0].history.length,2);
 h.context.location.hash='#feynman?module=2&topic=2-1';assert.equal(h.api.toolDraft('feynman').data.title,'Увага та пам’ять');
});
test('Mismatched module/topic is rejected and a deleted source keeps the written explanation',()=>{
 const h=setup();assert.throws(()=>save(h,'feynman',{title:'Тема',explanation:'Текст',module:3,topicKey:'2-1'}));
 const x=save(h,'feynman',{title:'Тема',explanation:'Текст',resourceId:'deleted-source'});assert.match(h.api.vLearningRecords('feynman'),/Текст/);assert.match(h.api.vLearningRecords('feynman'),/недоступний/);assert.equal(x.resourceId,'deleted-source');
});
test('Old research can be edited without dropping custom fields and all empty fields are explicit',()=>{
 const h=setup();h.api.state.research.push({id:'old-r',title:'Стара стаття',question:'Питання',module:3,future:{keep:true}});
 const r=save(h,'research',{title:'Редагована',bibliography:'Автор, 2020',doi:'10.1/example',design:'Кореляційний',causal:'Ні',implications:'Обережно',conclusion:'Даних мало',check_design:true},'old-r');
 assert.equal(r.question,'Питання');assert.equal(r.future.keep,true);assert.equal(r.readingChecks.design,true);
 assert.match(h.api.vResearch(),/не зазначено/);assert.match(h.api.vResearch(),/Редагована/);
 assert.throws(()=>save(h,'research',{title:'x',url:'javascript:alert(1)'}));
});
test('Concept map filters module and selected node and preserves legacy labels on edit',()=>{
 const h=setup();h.api.state.concepts.push({id:'old-c',a:'Увага',b:'Пам’ять',relation:'підтримує',module:2,note:'Стара нотатка',future:4});
 save(h,'concepts',{a:'Сон',b:'Увага',relation:'пов’язаний із',module:2});save(h,'concepts',{a:'Група',b:'Рішення',relation:'впливає',module:4});
 h.context.location.hash='#concepts?module=2&node='+encodeURIComponent('Памʼять');assert.equal(h.api.conceptItems().length,1);
 const x=save(h,'concepts',{note:'Нове пояснення'},'old-c');assert.equal(x.future,4);assert.equal(x.relation,'підтримує');assert.match(h.api.vConcepts(),/Нове пояснення/);
});
test('Structured case input preserves the previous free-text note and completion after reload',()=>{
 const h=setup();h.api.state.caseNotes.case1='Мій старий текст';emit(h,'input',{id:'',dataset:{case:'case1',caseField:'alternatives'},value:'Інший контекст'});
 emit(h,'change',{dataset:{case:'case1',caseField:'complete'},type:'checkbox',checked:true});
 const re=harness(h.storage.get(KEY));assert.equal(re.api.state.caseNotes.case1,'Мій старий текст');assert.equal(re.api.state.caseAnalysis.case1.alternatives,'Інший контекст');assert.equal(re.api.state.caseAnalysis.case1.complete,true);
 assert.match(re.api.vCases(),/навчальні гіпотези/i);assert.match(re.api.vCases(),/Інший контекст/);
});
test('Critical exercises require an attempt before revealing and persist each result',()=>{
 const h=setup();assert.equal(h.api.criticalTasks.length,6);
 for(const t of h.api.criticalTasks){assert.equal(h.api.criticalReveal(t.id),false);assert.equal(h.api.criticalChoose(t.id,(t.answer+1)%3),true);assert.equal(h.api.criticalReveal(t.id),true)}
 const re=harness(h.storage.get(KEY));assert.equal(Object.keys(re.api.state.criticalProgress).length,6);assert.match(re.api.vCritical(),/6\/6/);
 re.api.criticalChoose('causality',1);assert.equal(re.api.state.criticalProgress.causality.revealed,false);
});
test('Search normalizes whitespace, case and Ukrainian apostrophes with typo support',()=>{
 const h=setup();assert.equal(h.api.searchNorm('  ПАМʼЯТЬ  та\nУвага '),"пам'ять та увага");
 const x=save(h,'ideas',{text:'Пам’ять реконструюється',tags:'семінар'});
 assert.ok(h.api.commandMatches("пам'ять").some(i=>i.target.includes(x.id)));
 assert.ok(h.api.commandMatches('реконструюєтся').some(i=>i.target.includes(x.id)));
 assert.ok(h.api.searchRank({title:'Пам’ять',sub:''},'пам’ять')>h.api.searchRank({title:'Інше',sub:'Пам’ять'},'пам’ять'));
});
test('Search indexes original resource details, personal notes and every new record context',()=>{
 const h=setup();const rows=[['ideas',{text:'унікальнаідея'}],['journal',{date:'2026-11-09',understood:'унікальнийщоденник'}],['feynman',{title:'Поняття',explanation:'унікальнийфейнман'}],['research',{title:'Стаття',sample:'унікальнавибірка'}],['concepts',{a:'Вузол',b:'Інший',relation:'зв’язок',note:'унікальнийзв’язок'}]];
 for(const [type,data] of rows){const x=save(h,type,data),token=Object.values(data).find(v=>v.startsWith('унікаль'));assert.ok(h.api.commandMatches(token).some(i=>i.target===type+'?entry='+x.id),type)}
 assert.ok(h.api.commandMatches('Збережена нотатка').some(i=>i.target==='m3?notes=1'));
 assert.ok(h.api.commandMatches('Матеріал для перевірки').some(i=>i.target==='m3?material=module-3-m-legacy'));
 assert.ok(h.api.commandMatches('інтерференція').some(i=>i.target==='experiments'));
 assert.ok(h.api.commandMatches('вибірки').some(i=>i.target==='critical?entry=selection'));
});
test('Highlight and every tool escape user HTML before rendering',()=>{
 const h=setup(),attack='<img src=x onerror="boom"> & \' <script>evil</script>';
 const marked=h.api.searchHighlight(attack,'img');assert.match(marked,/&lt;<mark>img<\/mark>/);assert.doesNotMatch(marked,/<img|<script/);
 save(h,'ideas',{text:attack});save(h,'research',{title:attack});save(h,'concepts',{a:attack,b:'b',relation:'r'});
 for(const view of [h.api.vLearningRecords('ideas'),h.api.vResearch(),h.api.vConcepts()]){assert.doesNotMatch(view,/<img src=x|<script>evil/);assert.match(view,/&lt;img/)}
});
test('Command Enter opens exact entry, arrow navigation stays bounded, Escape closes',()=>{
 const h=setup(),x=save(h,'ideas',{text:'надунікальнаідея'});h.api.openCommand();h.nodes.get('cmd-q').value='надунікальнаідея';h.api.renderCommandResults('надунікальнаідея');
 assert.equal(h.api.commands.length,1);emit(h,'keydown',{tagName:'INPUT'},{key:'ArrowDown'});emit(h,'keydown',{tagName:'INPUT'},{key:'Enter'});
 assert.equal(h.context.location.hash,'#ideas?entry='+x.id);assert.equal(h.nodes.get('command-dialog').open,false);
 h.api.openCommand();emit(h,'keydown',{tagName:'INPUT'},{key:'Escape'});assert.equal(h.nodes.get('command-dialog').open,false);
});
test('Form submission saves the current fields and self-check values, then clears only its draft',()=>{
 const h=setup({hash:'#feynman'});h.api.writeToolDraft('feynman','','title','Поняття');h.api.writeToolDraft('ideas','','text','Інша чернетка');
 emit(h,'submit',{id:'tool',dataset:{tool:'feynman',edit:''},formValues:{title:'Поняття',explanation:'Текст',revised:'Фінальна версія',module:'2',clear:'on',needsCheck:'on'}});
 assert.equal(h.api.state.feynman.length,1);assert.equal(h.api.state.feynman[0].clear,true);assert.equal(h.api.state.feynman[0].hasExample,false);
 assert.equal(h.api.state.toolDrafts['feynman:new'],undefined);assert.equal(h.api.state.toolDrafts['ideas:new'].text,'Інша чернетка');assert.match(h.context.location.hash,/#feynman\?entry=/);
});
test('Deletion requires a second click and leaves unrelated records intact',()=>{
 const h=setup(),x=save(h,'ideas',{text:'Видалити'}),y=save(h,'ideas',{text:'Залишити'});
 const el={dataset:{a:'learn-delete',type:'ideas',k:x.id},textContent:'Видалити',closest(){return this}};
 emit(h,'click',el);assert.equal(h.api.state.ideas.length,2);assert.match(el.textContent,/Підтвердити/);
 emit(h,'click',el);assert.equal(h.api.state.ideas.length,1);assert.equal(h.api.state.ideas[0].id,y.id);
});
test('Module filters reflect their URL rather than silently selecting the wrong option',()=>{
 const h=setup({hash:'#concepts?module=2'});assert.match(h.api.vConcepts(),/<option value="2" selected>/);
 h.context.location.hash='#cases?module=12';assert.match(h.api.vCases(),/Немає кейсів із цими фільтрами/);
 h.context.location.hash='#cases';assert.match(h.api.vCases(),/<option value="" selected>Усі модулі/);
});
test('Search can open original cards and practical work, and card entry is rendered directly',()=>{
 const h=setup();assert.ok(h.api.commandMatches('Запитання').some(x=>x.target==='cards?entry=c-legacy'));
 h.api.state.work['3']='унікальнапрактична';assert.ok(h.api.commandMatches('унікальнапрактична').some(x=>x.target==='m3?panel=work'));
 h.context.location.hash='#cards?entry=c-legacy';h.api.render();assert.match(h.nodes.get('main').innerHTML,/data-tool-entry="c-legacy"/);
});
for(const duration of [5,15,25]){
 test(duration+' minute session pauses, reloads and finishes with single credit',()=>{
  const h=setup();assert.equal(h.api.startLearningSession(duration),true);assert.equal(h.api.timer.dur,duration*60);
  h.clock.now+=125000;h.api.timerAction('tm-pause');const re=harness(h.storage.get(KEY),{now:h.clock.now+3600000});
  assert.equal(re.api.timer.running,false);assert.equal(re.api.timer.left,duration*60-125);assert.equal(minutes(re),0);
  re.api.timerAction('tm-start');re.clock.now+=60000;re.api.finishLearningSession();assert.equal(minutes(re),3);assert.equal(re.api.state.learningSession.status,'summary');
  re.api.finishLearningSession();re.api.timerAction('tm-credit');assert.equal(minutes(re),3);
 });
 test(duration+' minute session auto-completes after reload exactly once',()=>{
  const h=setup();h.api.startLearningSession(duration);const re=harness(h.storage.get(KEY),{now:h.clock.now+duration*60000+1000});
  assert.equal(minutes(re),duration);assert.equal(re.api.state.learningSession.status,'summary');const again=harness(re.storage.get(KEY),{now:re.clock.now+999999});assert.equal(minutes(again),duration);
 });
}
test('Untimed session tracks its summary without awarding time or XP',()=>{
 const h=setup(),xp=h.api.state.xp;assert.equal(h.api.startLearningSession(0),true);h.clock.now+=600000;assert.equal(h.api.startLearningSession(5),false);h.api.finishLearningSession();
 assert.equal(h.api.state.learningSession.status,'summary');assert.equal(minutes(h),0);assert.equal(h.api.state.xp,xp);
 emit(h,'input',{id:'',dataset:{sessionField:'worked'},value:'Прочитав розділ'});assert.equal(harness(h.storage.get(KEY)).api.state.learningSession.worked,'Прочитав розділ');
});
test('Existing timer and focus block a second session; resetting a session timer leaves a summary',()=>{
 const h=setup();h.api.startShortSession();assert.equal(h.api.startLearningSession(15),false);h.api.timerAction('tm-credit');h.api.focusAction('focus-start');assert.equal(h.api.startLearningSession(15),false);h.api.focusAction('focus-reset');
 h.api.startLearningSession(15);h.clock.now+=61000;h.api.timerAction('tm-reset');assert.equal(minutes(h),1);assert.equal(h.api.state.learningSession.status,'summary');
});
test('Reading preferences persist and theme changes do not affect drafts',()=>{
 const h=setup({hash:'#m2'});h.api.writeToolDraft('ideas','','text','Чернетка');assert.equal(h.api.changeReading('enabled',true),true);assert.equal(h.api.changeReading('size',22),true);assert.equal(h.api.changeReading('width',60),true);assert.equal(h.api.changeReading('line',1.9),true);assert.equal(h.api.changeReading('size',99),false);
 h.api.setTheme('dark');const re=harness(h.storage.get(KEY),{hash:'#m2'});assert.equal(re.nodes.get('body').classList.contains('reading-enabled'),true);assert.equal(re.api.state.reading.size,22);assert.equal(re.api.state.theme,'dark');assert.equal(re.api.state.toolDrafts['ideas:new'].text,'Чернетка');
 re.context.location.hash='#ideas';re.api.render();assert.equal(re.nodes.get('body').classList.contains('reading-enabled'),false);
});
test('All twelve built-in module explanations have three distinct hand-written levels',()=>{
 const h=setup();assert.equal(h.api.explanations.length,12);for(let n=1;n<=12;n++){assert.equal(new Set(h.api.explanations[n-1]).size,3);for(const level of ['simple','standard','deep']){h.api.state.explanationLevel=level;assert.match(h.api.moduleExplanationHTML(n),/Авторський навчальний огляд/)}}
});
test('Continue link restores existing reading model and survives hidden/deleted resources',()=>{
 const h=setup();h.api.rememberResource('module-3-m-legacy');h.api.saveModuleView(3,{scrollY:500,anchor:'resource:module-3-m-legacy',offset:-10,panels:[],resources:[]});
 h.context.location.hash='#overview';h.api.render();assert.match(h.nodes.get('main').innerHTML,/material=module-3-m-legacy&amp;resume=1/);
 const re=harness(h.storage.get(KEY));assert.equal(re.api.state.moduleViews[3].scrollY,500);re.api.setMaterialHidden('module-3-m-legacy',true);assert.equal(re.api.resumeTarget().resource,null);assert.equal(re.api.resumeTarget().module,3);
});
for(const mode of ['color','spatial']){
 test('Stroop '+mode+' completes all randomized conditions and persists one result',()=>{
  const h=setup({hash:'#experiments'});h.api.startExperiment('stroop',mode);assert.equal(h.api.experiment.trials.filter(t=>t.congruent).length,8);
  assert.equal(h.api.stroopAnswer(0),false); // no timing before stimulus is armed
  for(let i=0;i<16;i++){h.clock.now+=500;const trial=h.api.experiment.trials[h.api.experiment.index];assert.equal(h.api.stroopAnswer(trial.target),true)}
  assert.equal(h.api.experiment.stage,'result');assert.equal(h.api.state.experimentResults.length,1);assert.equal(h.api.state.experimentResults[0].rows.length,16);assert.equal(h.api.stroopAnswer(0),false);
  assert.match(h.api.experimentSummary(h.api.experiment),/16\/16/);assert.equal(harness(h.storage.get(KEY)).api.state.experimentResults.length,1);
 });
}
test('Hidden-tab Stroop discards elapsed hidden time and route changes pause current trial',()=>{
 const h=setup({hash:'#experiments'});h.api.startExperiment('stroop');h.clock.now+=500;h.context.document.visibilityState='hidden';emit(h,'visibilitychange',{});h.clock.now+=100000;
 assert.equal(h.api.experiment.stage,'paused');assert.equal(h.api.stroopAnswer(1),false);h.context.document.visibilityState='visible';h.api.experimentNext();h.clock.now+=600;h.api.stroopAnswer(h.api.experiment.trials[0].target);assert.equal(h.api.experiment.rows[0].ms,600);
 h.context.location.hash='#overview';h.api.renderPageNavigation();assert.equal(h.api.experiment.stage,'paused');
});
test('Memory completes 3/5/7-digit trials, counts positions and restores saved results',()=>{
 const h=setup({hash:'#experiments'});h.api.startExperiment('memory');
 for(const len of [3,5,7]){assert.equal(h.api.experiment.sequence.length,len);assert.equal(h.api.memoryAnswer('1'),false);h.runTimeout(4000);assert.equal(h.api.experiment.stage,'recall');assert.equal(h.api.memoryAnswer('abc'),false);const seq=h.api.experiment.sequence;assert.equal(h.api.memoryAnswer(seq.split('').join(' ')),true);if(len<7)h.api.experimentNext()}
 assert.equal(h.api.experiment.stage,'result');assert.deepEqual(plain(h.api.experiment.rows.map(x=>x.correct)),[3,5,7]);const re=harness(h.storage.get(KEY));assert.equal(re.api.state.experimentResults[0].rows.length,3);assert.match(re.api.vExperiments(),/3 цифр: 3\/3/);
});
test('Hidden memory presentation cancels timeout and restarts current length on explicit resume',()=>{
 const h=setup({hash:'#experiments'});h.api.startExperiment('memory');h.context.document.visibilityState='hidden';emit(h,'visibilitychange',{});assert.equal(h.api.experiment.stage,'paused');assert.equal([...h.timeouts.values()].some(t=>t.ms===4000),false);
 h.context.document.visibilityState='visible';assert.equal(h.api.memoryAnswer('123'),false);h.api.experimentNext();assert.equal(h.api.experiment.sequence.length,3);assert.equal(h.api.experiment.rows.length,0);
});
test('All new records, drafts, checks, reading and session summary round-trip together',()=>{
 const h=setup();save(h,'ideas',{text:'Ідея'});save(h,'journal',{date:'2026-11-09',understood:'Досвід'});save(h,'feynman',{title:'Тема',explanation:'Текст',revised:'Фінал'});save(h,'research',{title:'Стаття',conclusion:'Висновок'});save(h,'concepts',{a:'A',b:'B',relation:'R'});h.api.writeToolDraft('research','','method','Незавершено');h.api.criticalChoose('evidence',0);h.api.criticalReveal('evidence');h.api.changeReading('size',20);h.api.startLearningSession(0);h.api.finishLearningSession();
 const data=h.api.decodeBackup(JSON.stringify(h.api.createBackup())),other=setup();assert.equal(other.api.applyBackup(data),true);
 for(const key of ['ideas','journal','feynman','research','concepts','toolDrafts','criticalProgress','reading','learningSession','_legacyMetadata'])assert.deepEqual(plain(other.api.state[key]),plain(h.api.state[key]),key);
});
test('Every new hash renders directly, with 3 primary mobile destinations retained',()=>{
 const h=setup();for(const route of ['ideas','journal','feynman','sessions','experiments','critical']){h.context.location.hash='#'+route;h.api.render();assert.equal(h.api.route(),route);assert.match(h.nodes.get('main').innerHTML,/<h1>/)}
 assert.equal([...h.api.primaryNavHTML(true).matchAll(/href=/g)].length,3);
});
test('PWA update accepts persisted new drafts, still blocks storage errors, and cache assets exist',()=>{
 const h=setup();h.api.writeToolDraft('ideas','','text','Збережено');h.context.document.querySelectorAll=q=>q.startsWith('form ')?[{dataset:{toolField:'text'},value:'Збережено',defaultValue:'',type:'textarea',tagName:'TEXTAREA'}]:[];
 assert.equal(h.api.hasUnsavedDraft(),false);const sent=[];h.api.pwaReg={waiting:{postMessage:m=>sent.push(m)}};assert.equal(h.api.applyPWAUpdate(),true);assert.equal(sent.length,1);
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','manifest.webmanifest')));for(const i of manifest.icons)assert.ok(fs.existsSync(path.join(__dirname,'..',i.src)));
});

async function run(){const prev=await previous.run();return {passed:prev.passed+cases.length,learningPassed:cases.length,cases}}
module.exports={run,cases};
if(require.main===module)run().then(r=>console.log(`${r.passed} checks passed (${r.learningPassed} learning tools).`)).catch(e=>{console.error(e);process.exitCode=1});
