'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {harness,legacyState}=require('./stage2.test.cjs');
const KEY='psykholohiia-rik-v1',plain=x=>JSON.parse(JSON.stringify(x));
const setup=(state=legacyState(),options={})=>harness(JSON.stringify(state),options);
function emit(h,type,target){for(const fn of h.documentEvents[type]||[])fn({target,preventDefault(){}})}
function click(h,a,data={}){emit(h,'click',{dataset:{a,...data},closest(){return this}})}
function change(h,a,data={},value='',checked=false){emit(h,'change',{dataset:{a,...data},value,checked})}

test('Old state and both old backup formats retain every original property and default to guided',()=>{
 const old=JSON.parse(fs.readFileSync(__dirname+'/fixtures/legacy-v1-profile.json','utf8'));
 const h=setup(old);assert.equal(h.api.blocked,false);assert.equal(h.api.state.studyMode,'guided');
 for(const k of Object.keys(old))assert.deepEqual(plain(h.api.state[k]),old[k],k);
 for(const data of [old,{app:'Рік психології',version:1,state:old}]){
  const target=harness();assert.equal(target.api.applyBackup(h.api.decodeBackup(JSON.stringify(data))),true);
  for(const k of Object.keys(old))if(k!=='updatedAt')assert.deepEqual(plain(target.api.state[k]),old[k],k);
 }
});
test('Mode toggles preserve all learning data, drafts, unknown fields and legacy completion',()=>{
 const h=setup();h.api.createBackup();const before=plain(h.api.state);
 assert.equal(h.api.setStudyMode('solo'),true);assert.equal(h.api.setStudyMode('guided'),true);
 assert.deepEqual(plain(h.api.state),before);assert.equal(h.api.setStudyMode('bad'),false);
 change(h,'study-mode',{},'solo');assert.equal(h.api.state.studyMode,'solo');
 assert.match(h.nodes.get('main').innerHTML,/Навчайся самостійно/);
 assert.equal(harness(h.storage.get(KEY)).api.state.studyMode,'solo');
});
test('Normalization is idempotent and mode defaults are safe',()=>{
 const h=setup(),s=h.api.norm({...legacyState(),studyMode:null});assert.equal(s.studyMode,'guided');
 assert.deepEqual(plain(h.api.norm(s)),plain(s));assert.equal(h.api.norm({studyMode:99}).studyMode,'guided');
 assert.throws(()=>h.api.decodeBackup(JSON.stringify({...legacyState(),studyMode:'bad'})));
});
test('Only module 1 has authored outcomes and the original topic order stays intact',()=>{
 const h=setup();assert.equal(h.api.modules.length,12);assert.equal(h.api.modules[0].topics.length,6);
 assert.deepEqual(plain(h.api.modules.map(m=>m.topics)),JSON.parse(fs.readFileSync(__dirname+'/fixtures/legacy-topics.json','utf8')));
 assert.equal(Object.keys(h.api.topicOutcomeContent).length,6);
 for(let i=0;i<6;i++){assert.equal(h.api.topicOutcomes('1-'+i).length,2);assert.match(h.api.soloOutcomesHTML('1-'+i),/Я можу це зробити/)}
 assert.match(h.api.soloOutcomesHTML('2-0'),/Результати ще не додано/);
 h.api.topicOutcomeContent['2-0']={outcomes:['Поясню сприйняття']};assert.equal(h.api.topicOutcomes('2-0')[0].text,'Поясню сприйняття');
});
test('Own outcomes and checks persist by topic without modifying numbered progress',()=>{
 const h=setup(),before=plain(h.api.state.topics);assert.equal(h.api.addSoloOutcome('2-0','Поясню своїми словами'),true);
 const id=h.api.topicOutcomes('2-0')[0].id;change(h,'solo-outcome',{k:'2-0',id},'',true);
 const re=harness(h.storage.get(KEY));assert.equal(re.api.soloTopic('2-0').outcomeChecks[id],true);
 assert.deepEqual(plain(re.api.state.topics),before);assert.equal(h.api.addSoloOutcome('__proto__','Ні'),false);
 assert.equal(h.api.addSoloOutcome('1-0','Третій результат'),true);assert.equal(h.api.addSoloOutcome('1-0','Четвертий'),false);
 assert.throws(()=>h.api.decodeBackup(JSON.stringify({...legacyState(),soloTopics:{'99-0':{}}})));
});
test('Solo topics reuse notes and the existing source form with preselected topic',()=>{
 const h=setup({...legacyState(),studyMode:'solo'},{hash:'#m3?topic=3-2'}),view=h.nodes.get('main').innerHTML;
 for(const label of ['Мої джерела','Своїми словами','Моє завдання на закріплення','Результати ще не додано','Підказки: готові матеріали'])assert.ok(view.includes(label),label);
 click(h,'solo-source',{m:'3',k:'3-2'});const form=h.nodes.get('matdlg').innerHTML;
 assert.match(form,/id="matform"/);assert.match(form,/<option value="3" selected>/);assert.match(form,/<option value="2" selected>/);
 emit(h,'submit',{id:'matform',dataset:{rid:''},formValues:{title:'Моя книга',url:'',type:'Книга',module:'3',topic:'2',status:'Заплановано'}});
 const r=h.api.allResources().find(r=>r.title==='Моя книга');assert.equal(r.topicKey,'3-2');assert.equal(r.origin,'custom');assert.equal(r.url,'');
 emit(h,'input',{id:'solo-note-3-2',dataset:{bind:'topicNotes',k:'3-2'},value:'Моє розуміння',style:{},classList:{contains:()=>true}});
 emit(h,'input',{dataset:{soloField:'exercise',k:'3-2'},value:'Порівняю дві думки',style:{},classList:{contains:()=>true}});
 emit(h,'input',{dataset:{soloField:'exerciseResult',k:'3-2'},value:'Знайшов відмінність',style:{},classList:{contains:()=>true}});
 const re=harness(h.storage.get(KEY),{hash:'#m3?topic=3-2'});assert.equal(re.api.state.topicNotes['3-2'],'Моє розуміння');
 assert.equal(re.api.soloTopic('3-2').exerciseResult,'Знайшов відмінність');assert.match(re.nodes.get('main').innerHTML,/Моя книга/);
 assert.equal(re.api.state.topicMaterials['3-2'].length,1);
});
test('Ready content remains inside collapsed hints and all personal text is escaped',()=>{
 const h=setup({...legacyState(),studyMode:'solo'},{hash:'#m1?topic=1-0'});
 const before=plain(h.api.allResources(true));assert.match(h.api.soloHintsHTML(1),/^<details class="module-section"><summary>Підказки: готові матеріали/);
 assert.match(h.api.soloHintsHTML(1),/builtin-media-1-0/);assert.deepEqual(plain(h.api.allResources(true)),before);
 const attack='<img src=x onerror=bad>';h.api.addSoloOutcome('2-0',attack);h.api.writeSoloField('2-0','exercise',attack);h.api.state.topicNotes['2-0']=attack;
 const view=h.api.vSoloModule(2);assert.doesNotMatch(view,/<img src=x/);assert.match(view,/&lt;img/);
 assert.equal(h.api.writeSoloField('2-0','bad','x'),false);assert.equal(h.api.writeSoloField('12-99','exercise','x'),false);
});
function answerQuiz(h,n,score){
 const qs=h.api.activeQuiz.questions,correct=Math.round(qs.length*score/100),original=h.context.document.querySelector;
 h.context.document.querySelector=sel=>{const i=qs.findIndex(q=>sel==='input[name="qa-'+q.id+'"]:checked');return i<0?original(sel):{value:i<correct?qs[i].answer:(qs[i].answer+1)%qs[i].choices.length}};
 const saved=h.api.submitModuleQuiz(n);h.context.document.querySelector=original;return saved;
}
test('Solo tests warn before early attempts and offer optional persisted recall before questions',()=>{
 const h=setup({...legacyState(),studyMode:'solo'},{hash:'#m3'});assert.match(h.api.quizSectionHTML(3),/Ще не всі теми опрацьовано/);
 click(h,'quiz-start',{m:'3',mode:'exam'});assert.equal(h.api.activeQuiz.phase,'prepare');assert.equal(h.api.submitModuleQuiz(3),false);
 assert.match(h.nodes.get('main').innerHTML,/Відповідь з пам’яті/);assert.match(h.nodes.get('main').innerHTML,/Почати попри незавершені теми/);
 emit(h,'input',{dataset:{quizRecall:'3'},value:'Пригадав приклад',style:{},classList:{contains:()=>true}});
 assert.equal(harness(h.storage.get(KEY)).api.state.toolDrafts['solo-recall:3'].text,'Пригадав приклад');
 click(h,'quiz-begin',{m:'3'});assert.equal(answerQuiz(h,3,100),true);assert.equal(h.api.state.quizResults[3].examBest,100);
 assert.equal(h.api.state.quizResults[3].attempts,1);assert.equal(h.api.submitModuleQuiz(3),false);
 for(let i=0;i<h.api.modules[2].topics.length;i++)h.api.state.topics['3-'+i]=true;
 assert.match(h.api.quizSectionHTML(3),/Пройти тест після модуля/);assert.doesNotMatch(h.api.quizSectionHTML(3),/Ще не всі теми опрацьовано/);
});
test('Questions use the module bucket by default and optional explicit module association',()=>{
 const h=setup({...legacyState(),studyMode:'solo'});h.api.state.quiz={3:[{id:'old',question:'Старе?',choices:['Так','Ні'],answer:0},{id:'new',module:2,question:'Нове?',choices:['Так','Ні'],answer:0}]};
 assert.equal(h.api.questionsForModule(3)[0].id,'old');assert.equal(h.api.questionsForModule(2)[0].id,'new');
 assert.match(h.api.quizSectionHTML(12),/Питань для цього модуля ще немає/);assert.equal(h.api.startModuleQuiz(12,'exam'),false);
 assert.equal(h.api.startModuleQuiz(2,'exam'),true);assert.equal(h.api.beginModuleQuiz(2),true);assert.equal(answerQuiz(h,2,100),true);
 assert.equal(h.api.state.quizResults[2].lastScore,100);
});
test('Threshold uses exam scores, preserves old result fields, and never accepts practice as an exam',()=>{
 const h=setup({...legacyState(),studyMode:'solo',quizResults:{3:{attempts:7,best:100,examPassed:true,extra:'keep'}}});
 assert.equal(h.api.moduleExamPassed(3),true);assert.equal(h.api.setQuizThreshold(90),true);assert.equal(h.api.moduleExamPassed(3),false);
 h.api.startModuleQuiz(3,'practice');h.api.beginModuleQuiz(3);answerQuiz(h,3,100);assert.equal(h.api.moduleExamPassed(3),false);
 h.api.startModuleQuiz(3,'exam');h.api.beginModuleQuiz(3);answerQuiz(h,3,100);assert.equal(h.api.moduleExamPassed(3),true);
 assert.equal(h.api.state.quizResults[3].extra,'keep');assert.equal(h.api.state.quizResults[3].attempts,9);
 assert.equal(h.api.state.quizResults[3].lastThreshold,90);assert.equal(h.api.setQuizThreshold(101),false);assert.equal(h.api.setQuizThreshold(1.1),false);
 assert.throws(()=>h.api.decodeBackup(JSON.stringify({...legacyState(),quizPassThreshold:0})));
});
function completeTopic(h,n,i){const k=n+'-'+i;if(!h.api.topicOutcomes(k).length)h.api.addSoloOutcome(k,'Поясню тему '+(i+1));for(const o of h.api.topicOutcomes(k))change(h,'solo-outcome',{k,id:o.id},'',true);change(h,'topic',{k},'',true);h.api.writeSoloField(k,'exercise','Вправа');h.api.writeSoloField(k,'exerciseResult','Результат')}
test('Solo completion requires every topic, outcomes, written exercise results and a passing exam',()=>{
 const h=setup({...legacyState(),studyMode:'solo'},{hash:'#m1'}),legacyDone=plain(h.api.state.done);
 assert.equal(h.api.isModuleDone(1),false);assert.equal(h.api.doneCount(),0);
 for(let i=0;i<6;i++)completeTopic(h,1,i);assert.equal(h.api.soloNextTopic(1),-1);assert.equal(h.api.soloModuleStats(1).ready,false);
 h.api.state.quizResults[1]={examBest:70,examPassed:true};assert.equal(h.api.isModuleDone(1),true);assert.equal(h.api.soloModuleStats(1).pct,100);
 assert.equal(h.api.nextModule(),2);assert.deepEqual(plain(h.api.state.done),legacyDone);
 h.api.writeSoloField('1-0','exerciseResult','   ');assert.equal(h.api.isModuleDone(1),false);assert.equal(h.api.soloNextTopic(1),0);
 h.api.writeSoloField('1-0','exerciseResult','Результат');change(h,'solo-outcome',{k:'1-0',id:'builtin-0'},'',false);assert.equal(h.api.isModuleDone(1),false);
 h.api.setStudyMode('guided');assert.equal(h.api.isModuleDone(1),true);assert.deepEqual(plain(h.api.state.done),legacyDone);
});
test('Empty outcome lists never count as mastered and a module can use only custom outcomes',()=>{
 const h=setup({...legacyState(),studyMode:'solo'});for(let i=0;i<h.api.modules[1].topics.length;i++){const k='2-'+i;h.api.state.topics[k]=true;h.api.writeSoloField(k,'exercise','Вправа');h.api.writeSoloField(k,'exerciseResult','Результат')}
 h.api.state.quizResults[2]={examBest:100};assert.equal(h.api.isModuleDone(2),false);
 for(let i=0;i<h.api.modules[1].topics.length;i++)completeTopic(h,2,i);assert.equal(h.api.isModuleDone(2),true);
});
test('Difficult topics appear exactly seven days later, persist, and can be postponed or cleared',()=>{
 const h=setup({...legacyState(),studyMode:'solo'},{now:1800000000000});change(h,'solo-difficult',{k:'1-0'},'',true);
 assert.equal(h.api.soloReturnTopics(false).length,1);assert.equal(h.api.soloReturnTopics(true).length,0);
 const due=h.api.soloTopic('1-0').reviewDueAt;h.clock.now+=6*86400000;h.api.markSoloDifficult('1-0',true);assert.equal(h.api.soloTopic('1-0').reviewDueAt,due);
 h.clock.now=due-1;assert.equal(h.api.soloReturnTopics(true).length,0);h.clock.now=due;
 const re=harness(h.storage.get(KEY),{now:due,hash:'#overview'});assert.equal(re.api.soloReturnTopics(true)[0].key,'1-0');
 assert.match(re.nodes.get('main').innerHTML,/настав час повернутися/);click(re,'solo-reviewed',{k:'1-0'});assert.equal(re.api.soloReturnTopics(true).length,0);
 assert.equal(re.api.soloTopic('1-0').reviewDueAt,due+7*86400000);change(re,'solo-difficult',{k:'1-0'},'',false);assert.equal(re.api.soloReturnTopics(false).length,0);
});
test('Solo home and program navigation continue a topic with its outcomes and preserve the academic layer',()=>{
 const h=setup({...legacyState(),studyMode:'solo',studyResume:{module:1,resourceId:''}},{hash:'#overview'}),before=plain(h.api.state.academic);
 assert.match(h.nodes.get('main').innerHTML,/Поточний модуль/);assert.match(h.nodes.get('main').innerHTML,/Наступна тема/);
 assert.match(h.nodes.get('main').innerHTML,/Поясню, що вивчає психологія/);assert.match(h.api.primaryNavHTML(true),/href="#modules"/);
 assert.doesNotMatch(h.api.vModules(),/#study\?material=/);h.context.location.hash='#academic';h.api.render();assert.match(h.nodes.get('main').innerHTML,/<h1>/);
 assert.deepEqual(plain(h.api.state.academic),before);h.context.location.hash='';assert.equal(h.api.route(),'overview');
});
test('All new data round-trips through export and clean import, including unknown nested fields',()=>{
 const h=setup({...legacyState(),studyMode:'solo',quizPassThreshold:85},{hash:'#m2?topic=2-0'});completeTopic(h,2,0);h.api.markSoloDifficult('2-0',true);
 h.api.state.soloTopics['2-0'].future={keep:42};h.api.state.quizResults[2]={attempts:4,lastScore:90,best:100,examBest:90,lastMode:'exam',lastThreshold:85,future:{keep:true}};
 h.api.state.toolDrafts['solo-recall:2']={text:'Із пам’яті'};h.api.state.topicNotes['2-0']='Мій конспект';h.api.upsertMaterial({title:'Подкаст',url:'https://example.org/audio',type:'Інше',module:2,topicKey:'2-0'});
 const backup=h.api.decodeBackup(JSON.stringify(h.api.createBackup())),clean=harness();assert.equal(clean.api.applyBackup(backup),true);
 for(const k of Object.keys(backup))if(k!=='updatedAt')assert.deepEqual(plain(clean.api.state[k]),plain(backup[k]),k);
 const snapshot=plain(clean.api.state);clean.api.setStudyMode('guided');clean.api.setStudyMode('solo');assert.deepEqual(plain(clean.api.state),snapshot);
 assert.equal(harness(clean.storage.get(KEY)).api.soloTopic('2-0').future.keep,42);
});
test('Empty and corrupt stores render safely while retaining recoverable original data',()=>{
 for(const raw of [undefined,'','{broken','null','[]','{}']){const h=harness(raw);assert.equal(h.api.state.studyMode,'guided');assert.equal(h.api.state.quizPassThreshold,70);assert.match(h.nodes.get('main').innerHTML,/<h1>/);if(raw!==undefined){assert.equal(h.api.blocked,true);assert.equal(h.storage.get(KEY),raw)}}
 const h=harness('{broken');assert.equal(h.api.applyBackup({...legacyState(),studyMode:'solo'}),true);assert.equal(h.api.blocked,false);assert.equal(h.storage.get(KEY+'-pre-import'),'{broken');
});
test('Storage write failure and cross-tab conflict preserve exportable solo edits',()=>{
 const h=setup({...legacyState(),studyMode:'solo'},{failWrites:true});h.api.writeSoloField('1-0','exercise','Моя вправа');assert.match(h.api.error,/Не вдалося записати/);
 assert.equal(h.api.createBackup().state.soloTopics['1-0'].exercise,'Моя вправа');
 const other=setup({...legacyState(),studyMode:'solo'});other.storage.set(KEY,JSON.stringify(legacyState()));other.api.writeSoloField('1-0','exercise','Не втратити');assert.equal(other.api.blocked,true);assert.equal(other.api.createBackup().state.soloTopics['1-0'].exercise,'Не втратити');
});
test('Solo views cannot overwrite guided reading positions or expanded panels when switching back',()=>{
 const view={scrollY:450,anchor:'panel:topics',offset:5,panels:['topics','notes'],resources:['builtin-media-1-0']};
 const h=setup({...legacyState(),studyMode:'solo',moduleViews:{1:view}},{hash:'#m1'}),root={dataset:{moduleView:'1',soloView:'true'},querySelector(){return null},querySelectorAll(){return []}};
 h.nodes.get('main').querySelector=selector=>selector==='[data-module-view]'?root:null;
 assert.equal(h.api.captureReadingView(1),false);assert.equal(h.api.restoreReadingView(1),false);
 h.api.setStudyMode('guided');assert.equal(h.api.captureReadingView(1),false);assert.deepEqual(plain(h.api.state.moduleViews[1]),view);
});
test('Legacy questions with module zero keep their previous module bucket',()=>{
 const old=legacyState();old.quiz[3][0].module=0;const h=setup(old);assert.equal(h.api.blocked,false);assert.equal(h.api.questionsForModule(3)[0].id,'q-legacy');assert.equal(h.api.state.quiz[3][0].module,0);
});
test('All solo modules and quiz phases have balanced markup, unique IDs and labeled fields in both themes',()=>{
 const h=setup({...legacyState(),studyMode:'solo'}),views=[],voids=new Set(['input','br','hr','img','meta','link','source','wbr']);
 for(const theme of ['light','dark']){h.api.setTheme(theme);assert.equal(h.nodes.get('html').getAttribute('data-theme'),theme);views.push(h.api.vOverview());for(let n=1;n<=12;n++)views.push(h.api.vSoloModule(n));h.api.startModuleQuiz(3,'exam');views.push(h.api.vSoloModule(3));h.api.beginModuleQuiz(3);views.push(h.api.vSoloModule(3));answerQuiz(h,3,100);views.push(h.api.vSoloModule(3))}
 for(const view of views){const stack=[],ids=new Set();for(const match of view.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b([^>]*)>/gi)){const [,close,tag,attrs]=match;if(close){assert.equal(stack.pop(),tag,'balanced '+tag);continue}const id=attrs.match(/\bid="([^"]+)"/);if(id){assert.equal(ids.has(id[1]),false,'unique '+id[1]);ids.add(id[1])}if(['form','label'].includes(tag))assert.equal(stack.includes(tag),false,'not nested '+tag);if(['input','textarea','select'].includes(tag))assert.ok(stack.includes('label')||attrs.includes('aria-label')||(id&&view.includes('for="'+id[1]+'"')),'labeled '+tag);if(!voids.has(tag))stack.push(tag)}assert.equal(stack.length,0)}
});
test('Invalid new nested data is rejected without replacing the active profile',()=>{
 const h=setup(),before=plain(h.api.state),bad=[{outcomes:[{id:'own-a',text:''}]},{outcomes:[{id:'own-a',text:'a'},{id:'own-a',text:'b'}]},{outcomeChecks:[]},{outcomeChecks:{a:'yes'}},{exercise:[]},{exerciseResult:42},{reviewDueAt:-1},{difficultAt:'today'}];
 for(const record of bad)assert.throws(()=>h.api.decodeBackup(JSON.stringify({...legacyState(),soloTopics:{'1-0':record}})));
 assert.deepEqual(plain(h.api.state),before);
});
