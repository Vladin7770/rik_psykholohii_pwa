'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {harness,legacyState}=require('./stage2.test.cjs');
const root=path.join(__dirname,'..'),KEY='psykholohiia-rik-v1',CID='rik-academic-year-one',ID='ay1-facts-hypotheses';
const plain=x=>JSON.parse(JSON.stringify(x));
const fixture=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/legacy-v1-profile.json'),'utf8'));
const ctx={window:{},URL};vm.createContext(ctx);for(const file of ['curriculum.js','academic-core.js'])vm.runInContext(fs.readFileSync(path.join(root,'content',file),'utf8'),ctx);
const c=ctx.window.RikAcademicContent,k=ctx.window.RikAcademicCore,l=c.lessons.find(x=>x.id===ID),pilots=c.lessons.filter(x=>x.publicationStatus==='pilot');
function setup(hash='#academic?lesson='+ID){return harness(JSON.stringify(fixture()),{hash,now:1794218400000})}
function rec(h,id=ID){return h.api.state.academic.curricula[CID]?.lessons[id]||{}}
function nav(h,hash){h.context.location.hash=hash;h.api.renderPageNavigation()}
function event(h,type,target){for(const fn of h.documentEvents[type]||[])fn({target,preventDefault(){}})}
function answerAll(h,correct=true){for(const q of l.assessments)h.api.academic.choose(ID,q.id,correct?q.answerKey:(q.answerKey+1)%q.choices.length);return h.api.academic.action('assess',{})}

test('Canonical curriculum has 12 modules, 99 semantic lesson IDs and exactly three pilot texts',()=>{
 assert.equal(k.validateContent(c),c);assert.equal(c.modules.length,12);assert.equal(c.lessons.length,99);assert.equal(pilots.length,3);
 assert.ok(c.lessons.every(x=>!/^m\d/.test(x.id)));assert.ok(pilots.every(x=>x.editorialStatus==='scientific_review_needed'));
 for(const p of pilots){const prose=p.sections.flatMap(x=>x.paragraphs).join(' ');assert.ok(prose.split(/\s+/).length>500);assert.ok(prose.length>4500);assert.equal(p.editorialChecklist.independent_subject_review,false)}
});
for(const [name,change] of [
 ['duplicate lesson',x=>x.lessons[1].id=x.lessons[0].id],
 ['module cycle',x=>x.modules[0].prerequisites=[x.modules[1].id]],
 ['lesson cycle',x=>x.lessons[0].prerequisiteLessonIds=[x.lessons[1].id]],
 ['missing related lesson',x=>x.lessons[0].relatedLessonIds=['ay1-missing']],
 ['unplaced lesson',x=>x.modules[0].lessonIds.pop()],
 ['empty pilot',x=>x.lessons[0].sections=[]],
 ['duplicate paragraph',x=>x.lessons[0].sections[1].paragraphs[0]=x.lessons[0].sections[0].paragraphs[0]],
 ['false peer review',x=>x.lessons[0].editorialStatus='reviewed'],
 ['missing assessment',x=>x.lessons[0].assessments=[]],
 ['pending source promoted',x=>x.lessons[0].references.push('nice-ng222')],
 ['unsafe URL',x=>x.sources[0].url='javascript:alert(1)'],
 ['false source reading',x=>x.sources[0].readingStatus='not_read'],
 ['orphan assessment objective',x=>x.lessons[0].assessments[0].objectiveIds=['unknown']]
])test('Content gate rejects '+name,()=>{const bad=plain(c);change(bad);assert.throws(()=>k.validateContent(bad))});

test('WHO full manual and inaccessible candidates are not presented as fully read',()=>{
 assert.equal(c.sources.find(s=>s.id==='who-cddr').readingStatus,'overview_only');
 for(const id of ['apa-ebp','nice-ng222','dunlosky']){const s=c.sources.find(s=>s.id===id);assert.equal(s.verificationStatus,'verification_pending');assert.equal(s.verifiedAt,null);assert.ok(s.lessonIds.every(id=>c.lessons.find(l=>l.id===id).publicationStatus==='planned'))}
});
test('Opening a pilot preserves every legacy field including old card due dates and unknown nested fields',()=>{
 const old=fixture(),h=setup();for(const key of Object.keys(old).filter(k=>k!=='updatedAt'))assert.deepEqual(plain(h.api.state[key]),old[key],key);
 assert.equal(h.api.state.v,1);assert.equal(h.api.state.cards[0].dueAt,old.cards[0].dueAt);assert.equal(rec(h).stage,'theory');assert.equal(k.status(rec(h)),'viewed');
});
test('Curriculum and legacy modules both remain reachable without prerequisite locks',()=>{
 const h=setup('#academic?lesson=ay1-experience-category');assert.match(h.nodes.get('main').innerHTML,/опис переживання/);assert.equal(k.status(rec(h,'ay1-experience-category')),'viewed');
 for(let n=1;n<=12;n++){nav(h,'#m'+n);assert.match(h.nodes.get('main').innerHTML,/<h1[ >]/)}
 nav(h,'#modules');assert.match(h.nodes.get('main').innerHTML,/module-list/);nav(h,'#academic');assert.match(h.nodes.get('main').innerHTML,/Попередня програма/);
 h.context.location.hash='';assert.equal(h.api.route(),'academic');
});
test('A planned lesson shows a development map and never creates progress or a fake lecture',()=>{
 const h=setup('#academic?lesson=ay1-bion');assert.match(h.nodes.get('main').innerHTML,/Урок заплановано/);assert.equal(h.api.state.academic.curricula[CID],undefined);assert.doesNotMatch(h.nodes.get('main').innerHTML,/data-ac-action="complete"/);
});
test('Unknown or malicious lesson IDs show a useful safe fallback',()=>{
 const h=setup('#academic?lesson='+encodeURIComponent('<img src=x onerror=evil>'));assert.match(h.nodes.get('main').innerHTML,/Урок не знайдено/);assert.doesNotMatch(h.nodes.get('main').innerHTML,/<img src=x/);
});
test('Draft debounce does not redraw typing; pagehide flushes pending text and roundtrip preserves all fields',()=>{
 const h=setup(),before=h.nodes.get('main').innerHTML,raw=h.storage.get(KEY);
 event(h,'input',{id:'',dataset:{acField:'notes',acLesson:ID},value:'Мій конспект <script> & апостроф’'});
 assert.equal(h.nodes.get('main').innerHTML,before);assert.equal(h.storage.get(KEY),raw);assert.equal(rec(h).drafts.notes,undefined);
 for(const fn of h.windowEvents.pagehide)fn({});assert.equal(rec(h).drafts.notes,'Мій конспект <script> & апостроф’');
 const exported=JSON.stringify(h.api.createBackup()),decoded=h.api.decodeBackup(exported);assert.deepEqual(plain(decoded.academic),plain(h.api.state.academic));
 const re=harness(JSON.stringify(decoded),{hash:'#academic?lesson='+ID});assert.equal(rec(re).drafts.notes,rec(h).drafts.notes);assert.match(re.nodes.get('main').innerHTML,/&lt;script&gt;/);
});
test('Export and route changes flush pending drafts before any debounce timer fires',()=>{
 const h=setup();h.api.academic.write(ID,'case','Моя незавершена версія');const backup=h.api.createBackup();assert.equal(backup.state.academic.curricula[CID].lessons[ID].drafts.case,'Моя незавершена версія');
 h.api.academic.write(ID,'thinking','Друга версія');nav(h,'#academic?lesson='+ID+'&stage=thinking');assert.equal(rec(h).drafts.thinking,'Друга версія');
});
test('Stage-specific position and reading level survive reload and do not overwrite old module positions',()=>{
 const h=setup();h.context.scrollY=820;nav(h,'#academic?lesson='+ID+'&stage=case');assert.equal(rec(h).stageScroll.theory,820);assert.equal(h.context.scrollY,0);
 h.context.scrollY=215;nav(h,'#academic?lesson='+ID+'&stage=theory');assert.equal(h.context.scrollY,820);assert.equal(rec(h).stageScroll.case,215);
 h.api.academic.action('level',{level:'deep'});h.api.academic.capture();const re=harness(h.storage.get(KEY),{hash:'#academic?lesson='+ID});assert.equal(re.context.scrollY,820);assert.equal(rec(re).readingLevel,'deep');assert.equal(re.api.state.moduleViews[3].scrollY,514);
});
test('A conflict keeps external data intact and exports this tab pending academic drafts',()=>{
 const h=setup(),external=JSON.stringify({...fixture(),futureRoot:{otherTab:true}});h.storage.set(KEY,external);h.api.academic.write(ID,'notes','Відкрита вкладка');h.api.academic.flush();assert.equal(h.api.blocked,true);assert.equal(h.storage.get(KEY),external);assert.equal(h.api.createBackup().state.academic.curricula[CID].lessons[ID].drafts.notes,'Відкрита вкладка');
});
test('Quota failures leave the draft in memory and visible storage warning',()=>{
 const h=harness(JSON.stringify(fixture()),{hash:'#academic?lesson='+ID,failWrites:true});h.api.academic.write(ID,'notes','Важливий текст');h.api.academic.flush();assert.match(h.api.error,/Не вдалося записати/);assert.equal(h.api.createBackup().state.academic.curricula[CID].lessons[ID].drafts.notes,'Важливий текст');
});
test('Import backs up the current draft and does not leak pending data into the imported state',()=>{
 const h=setup();h.api.academic.write(ID,'notes','До імпорту');assert.equal(h.api.applyBackup(h.api.decodeBackup(JSON.stringify(fixture()))),true);
 assert.equal(JSON.parse(h.storage.get(KEY+'-pre-import')).academic.curricula[CID].lessons[ID].drafts.notes,'До імпорту');assert.equal(h.api.state.academic.curricula[CID],undefined);h.api.academic.flush();assert.equal(h.api.state.academic.curricula[CID],undefined);
});
for(const [field,value] of [['stage','bad'],['scrollPosition',-1],['drafts',{notes:{}}],['attempts',[{kind:'assessment',at:1,correct:'yes',answers:{}}]],['choices',{'method-q1':-1}],['stageDone',{evil:true}]])test('Corrupt academic field '+field+' cannot overwrite the stored profile',()=>{
 const h=setup(),bad=plain(h.api.state);bad.academic.curricula[CID].lessons[ID][field]=value;const before=h.storage.get(KEY);assert.throws(()=>h.api.decodeBackup(JSON.stringify(bad)));assert.equal(h.storage.get(KEY),before);
});
test('Unknown future fields and orphan course records are retained through migration and export',()=>{
 const s=fixture();s.academic={schemaVersion:1,future:7,curricula:{'future-curriculum':{lessons:{'future-lesson':{drafts:{notes:'Архів'},future:{keep:true}}},future:'keep'}}};const h=harness(JSON.stringify(s));assert.deepEqual(plain(h.api.createBackup().state.academic),s.academic);
});
test('Seven stages render with labels, distinct questions and functional controls',()=>{
 const h=setup();for(const stage of k.stages){nav(h,'#academic?lesson='+ID+'&stage='+stage);const html=h.nodes.get('main').innerHTML;assert.equal((html.match(/aria-current="step"/g)||[]).length,1);assert.match(html,/ac-stage-title/);assert.match(html,/data-ac-field="notes"/)}
});
test('Knowledge levels distinguish zero attempts, wrong attempts and correct verifiable results',()=>{
 const h=setup('#academic?lesson='+ID+'&stage=assessment');assert.equal(h.api.academic.action('assess',{}),false);assert.equal(rec(h).attempts.length,0);answerAll(h,false);assert.equal(k.status(rec(h)),'attempted');assert.equal(rec(h).demonstratedAt,undefined);
 answerAll(h,true);assert.equal(k.status(rec(h)),'demonstrated');assert.equal(rec(h).retainedAt,undefined);assert.ok(rec(h).reviewDueAt>=h.clock.now+2*k.DAY);assert.equal(rec(h).attempts.length,2);
});
test('Read and self-completion cannot confer retained or demonstrated',()=>{
 const h=setup();assert.equal(h.api.academic.action('complete',{}),false);h.api.academic.write(ID,'opening','Припущення');h.api.academic.flush();assert.equal(h.api.academic.action('complete',{}),true);
 assert.equal(rec(h).demonstratedAt,undefined);assert.equal(rec(h).retainedAt,undefined);assert.equal(rec(h).stageDone.theory,true);
});
test('Case and open model require an original attempt and a deliberate reveal action',()=>{
 const h=setup('#academic?lesson='+ID+'&stage=case');assert.equal(h.api.academic.action('reveal',{field:'case'}),false);h.api.academic.write(ID,'case','Моє пояснення');assert.equal(h.api.academic.action('reveal',{field:'case'}),true);assert.match(h.nodes.get('main').innerHTML,/Зіставити власний аналіз/);
 nav(h,'#academic?lesson='+ID+'&stage=assessment');h.api.academic.write(ID,'open','Моя аргументація');assert.equal(h.api.academic.action('reveal',{field:'open'}),true);assert.match(h.nodes.get('main').innerHTML,/Еталон і рубрика/);assert.equal(rec(h).demonstratedAt,undefined);
});
test('Early review and empty review cannot become retained; delayed transfer can',()=>{
 const h=setup();answerAll(h);nav(h,'#academic?lesson='+ID+'&stage=retention');h.api.academic.write(ID,'review','Потрібні початкові вимірювання');h.api.academic.choose(ID,l.review.question.id,l.review.question.answerKey);assert.equal(h.api.academic.action('review',{rating:'good'}),false);
 h.clock.now+=2*k.DAY+1;h.api.academic.write(ID,'review','');assert.equal(h.api.academic.action('review',{rating:'good'}),false);h.api.academic.write(ID,'review','Обмежений висновок, самодобір і початкові знання');assert.equal(h.api.academic.action('review',{rating:'good'}),true);assert.equal(k.status(rec(h)),'retained');assert.equal(rec(h).reviewIntervalDays,4);assert.equal(h.api.academic.action('review',{rating:'easy'}),false);
});
test('Failure, difficulty and voluntary postponing schedule bounded reviews without pressure or XP',()=>{
 const h=setup(),old=plain({cards:h.api.state.cards,xp:h.api.state.xp,days:h.api.state.days,act:h.api.state.act});answerAll(h);h.clock.now+=2*k.DAY+1;
 h.api.academic.write(ID,'review','Власний аналіз');h.api.academic.choose(ID,l.review.question.id,(l.review.question.answerKey+1)%3);assert.equal(h.api.academic.action('review',{rating:'easy'}),true);assert.equal(rec(h).reviewIntervalDays,1);assert.equal(rec(h).retainedAt,undefined);
 const due=rec(h).reviewDueAt;h.api.academic.action('postpone',{});assert.equal(rec(h).reviewDueAt,due+k.DAY);assert.deepEqual(plain({cards:h.api.state.cards,xp:h.api.state.xp,days:h.api.state.days,act:h.api.state.act}),old);
});
test('Existing tools carry a stable academic lesson link without assigning a legacy module',()=>{
 const h=setup();h.api.academic.write(ID,'thinking','Моє пояснення');h.api.academic.bridge('feynman',ID);assert.equal(h.api.state.toolDrafts['feynman:new'].academicLessonId,ID);assert.equal(h.api.state.toolDrafts['feynman:new'].module,0);assert.equal(h.api.state.toolDrafts['feynman:new'].explanation,'Моє пояснення');
 const r=h.api.saveTool('feynman','',plain(h.api.state.toolDrafts['feynman:new']));assert.equal(r.academicLessonId,ID);assert.match(h.api.vLearningRecords('feynman'),/До академічного уроку/);
});
test('Bridges preserve an existing draft and create an idempotent linked calendar event',()=>{
 const h=setup();h.api.academic.bridge('ideas',ID);assert.equal(h.api.state.toolDrafts['ideas:new'].text,'Незавершена ідея');assert.equal(h.api.state.toolDrafts['ideas:new'].academicLessonId,undefined);
 h.api.academic.bridge('calendar',ID);h.api.academic.bridge('calendar',ID);const events=h.api.state.events.filter(e=>e.academicLessonId===ID);assert.equal(events.length,1);assert.equal(events[0].module,0);assert.equal(h.context.location.hash,'#calendar');h.api.render();assert.match(h.nodes.get('main').innerHTML,/До повторення/);
});
test('Search indexes full lecture, terms, authors and pending notes with apostrophe normalization',()=>{
 const h=setup();h.api.academic.write(ID,'notes','надунікальнийконспект');
 assert.ok(h.api.commandMatches('надунікальнийконспект').some(x=>x.target.includes(ID)));assert.ok(h.api.commandMatches('висміювання').some(x=>x.target.includes('ay1-experience-category')));
 assert.ok(h.api.commandMatches('Scollon').some(x=>x.type==='Джерело'));assert.ok(h.api.commandMatches('витіснення').some(x=>x.type==='Академічний термін'));
});
test('PWA update and OAuth flush pending academic drafts before proceeding',()=>{
 const h=setup();h.api.academic.write(ID,'notes','Перед оновленням');const sent=[];h.api.pwaReg={waiting:{postMessage:x=>sent.push(x)}};assert.equal(h.api.applyPWAUpdate(),true);assert.equal(rec(h).drafts.notes,'Перед оновленням');assert.equal(sent.length,1);
 h.api.academic.write(ID,'notes','Перед OAuth');assert.equal(h.context.RikStudy.prepareAuthRedirect(),true);assert.equal(rec(h).drafts.notes,'Перед OAuth');
});
test('Published source assets are all included in build fingerprint and offline shell',()=>{
 const sw=fs.readFileSync(path.join(root,'service-worker.js'),'utf8'),build=fs.readFileSync(path.join(root,'scripts/build.mjs'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const name of ['curriculum.js','academic-core.js','academic-ui.js']){assert.ok(sw.includes('content/'+name));assert.ok(build.includes('content/'+name));assert.ok(html.includes('src="./content/'+name+'"'))}
});
test('Source links use HTTPS and reject credential URLs',()=>{for(const url of ['javascript:alert(1)','data:text/html,bad','https://user:pass@example.com'])assert.equal(k.safeURL(url),'');assert.ok(k.safeURL('https://www.who.int/'))});

test('Light Ukrainian ending matching finds inflected query terms',()=>{
 const h=setup();assert.ok(h.api.searchRank({title:'Інтерпретація',sub:''},'інтерпретаціями')>0);assert.ok(h.api.commandMatches('витісненням').some(x=>x.target.includes('ay1-psychoanalysis-intro')));
});
for(const [rating,expected] of [['again',1],['hard',2],['good',4],['easy',7]])test('Transparent review outcome '+rating+' schedules '+expected+' days',()=>{
 const a=k.defaultState(),now=1794218400000,r=k.ensure(a,CID,ID,now);for(const q of l.assessments)r.choices[q.id]=q.answerKey;k.assess(l,r,now);r.drafts.review='Самостійна відповідь';assert.equal(k.review(l,r,l.review.question.answerKey,rating,now+2*k.DAY),true);assert.equal(r.reviewIntervalDays,expected);assert.equal(!!r.retainedAt,['good','easy'].includes(rating));
});
test('Updating lesson wording keeps stable user drafts, attempts and unknown properties',()=>{
 const h=setup();h.api.academic.write(ID,'notes','Мій конспект');h.api.academic.flush();answerAll(h);const before=plain(rec(h));h.context.RikAcademicContent.lessons.find(x=>x.id===ID).titleUk='Уточнена назва';h.api.render();assert.deepEqual(plain(rec(h)),before);assert.match(h.nodes.get('main').innerHTML,/Уточнена назва/);
});
test('Ten-minute sessions reuse the existing timer and validation rules',()=>{
 const h=setup();assert.equal(h.api.startLearningSession(10),true);assert.equal(h.api.timer.dur,600);assert.doesNotThrow(()=>h.api.validateState(h.api.state));
});
test('Academic bookmark and draft roundtrip does not depend on array order',()=>{
 const h=setup();h.api.academic.write(ID,'notes','Постійний ID');h.api.academic.flush();h.context.RikAcademicContent.lessons.reverse();h.context.RikAcademicContent.modules.reverse();h.api.render();assert.equal(rec(h).drafts.notes,'Постійний ID');assert.match(h.nodes.get('main').innerHTML,/Чим відрізняються факт/);
});

test('Every pilot stage and feedback state has balanced HTML, unique IDs and accessible field structure',()=>{
 const h=setup(),views=[];
 function collect(hash){nav(h,hash);views.push(h.nodes.get('main').innerHTML)}
 for(const hash of ['#academic','#academic?sources=1','#academic?glossary=1','#academic?lesson=ay1-bion','#academic?lesson=missing'])collect(hash);
 for(const pilot of pilots)for(const stage of k.stages)collect('#academic?lesson='+pilot.id+'&stage='+stage);
 nav(h,'#academic?lesson='+ID+'&stage=assessment');h.api.academic.write(ID,'open','Власний аргумент');h.api.academic.write(ID,'case','Власний аналіз');answerAll(h);h.clock.now+=2*k.DAY+1;
 collect('#academic?lesson='+ID+'&stage=retention');assert.match(h.nodes.get('main').innerHTML,/data-ac-q="method-review"/);
 h.api.academic.write(ID,'review','Пригадування без підказки');h.api.academic.choose(ID,l.review.question.id,l.review.question.answerKey);assert.equal(h.api.academic.action('review',{rating:'good'}),true);views.push(h.nodes.get('main').innerHTML);
 collect('#academic?lesson='+ID+'&stage=case');collect('#academic?lesson='+ID+'&stage=assessment');
 const voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
 for(const html of views){const stack=[],ids=new Set();for(const match of html.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b([^>]*)>/gi)){const [,close,tag,attrs]=match;if(close){assert.equal(stack.pop(),tag,'balanced '+tag);continue}const id=attrs.match(/\bid="([^"]+)"/);if(id){assert.equal(ids.has(id[1]),false,'unique '+id[1]);ids.add(id[1])}if(['form','label'].includes(tag))assert.equal(stack.includes(tag),false,'not nested '+tag);if(!voids.has(tag))stack.push(tag)}assert.equal(stack.length,0)}
});

test('Existing cases and library expose the academic content without remapping old records',()=>{
 const h=setup();assert.match(h.api.vCases(),/academic\?lesson=ay1-psychoanalysis-intro&stage=case/);assert.match(h.api.vLibrary(),/academic\?sources=1/);assert.deepEqual(plain(h.api.state.caseNotes),fixture().caseNotes);
});
