'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {harness,legacyState}=require('./stage2.test.cjs');
const root=path.join(__dirname,'..'),KEY='psykholohiia-rik-v1',CID='rik-academic-year-one',ID='ay1-facts-hypotheses';
const plain=x=>JSON.parse(JSON.stringify(x));
const fixture=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/legacy-v1-profile.json'),'utf8'));
const ctx={window:{},URL};vm.createContext(ctx);for(const file of ['curriculum.js','academic-core.js'])vm.runInContext(fs.readFileSync(path.join(root,'content',file),'utf8'),ctx);
const c=ctx.window.RikAcademicContent,k=ctx.window.RikAcademicCore,l=c.lessons.find(x=>x.id===ID),pilots=c.lessons.filter(x=>x.publicationStatus!=='planned');
function setup(hash='#academic?lesson='+ID){return harness(JSON.stringify(fixture()),{hash,now:1794218400000})}
function rec(h,id=ID){return h.api.state.academic.curricula[CID]?.lessons[id]||{}}
function nav(h,hash){h.context.location.hash=hash;h.api.renderPageNavigation()}
function event(h,type,target){for(const fn of h.documentEvents[type]||[])fn({target,preventDefault(){}})}
function answerAll(h,correct=true){for(const q of l.assessments)h.api.academic.choose(ID,q.id,correct?q.answerKey:(q.answerKey+1)%q.choices.length);return h.api.academic.action('assess',{})}

test('Canonical curriculum has 12 modules, 99 semantic lesson IDs and twelve authored texts',()=>{
 assert.equal(k.validateContent(c),c);assert.equal(c.modules.length,12);assert.equal(c.lessons.length,99);assert.equal(pilots.length,12);
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

// Module 1 expansion: content contracts, compatibility with prior two-question
// editions, optional video work and explicit creation of existing study cards.
const foundations=c.lessons.filter(x=>x.moduleId==='ac-foundations');
test('Module 1 contains ten authored lessons, with 50 immediate items, 10 transfer items and 40 review units',()=>{
 assert.equal(foundations.length,10);assert.ok(foundations.every(x=>x.publicationStatus==='published'));
 assert.equal(foundations.reduce((n,x)=>n+x.assessments.length,0),50);
 assert.equal(foundations.filter(x=>x.review.question).length,10);
 assert.equal(foundations.reduce((n,x)=>n+x.reviewUnits.length,0),40);
 assert.equal(c.lessons.filter(x=>x.publicationStatus==='planned').length,87);
});
for(const lesson of foundations)test('Module 1 academic structure and objective coverage: '+lesson.id,()=>{
 assert.ok(lesson.sections.length>=8);assert.ok(lesson.sections.flatMap(x=>x.paragraphs).join(' ').split(/\s+/).length>=700);
 assert.ok(lesson.perspectiveComparisons.length>=2);assert.ok(lesson.evidenceNotes.length>=2);
 assert.ok(lesson.caseStudy.prompts.length>=3);assert.ok(lesson.openAssessment.rubric.length>=3);
 assert.ok(lesson.reviewUnits.filter(x=>x.kind!=='definition').length>=2);
 for(const o of lesson.objectives)assert.ok(lesson.assessments.concat([lesson.review.question]).some(q=>q.objectiveIds.includes(o.id)),o.id);
 assert.equal(lesson.editorialChecklist.independent_subject_review,false);
 assert.equal(lesson.completionStatus,'needs_academic_review');
});
test('Other 89 lessons retain their pre-module-1 contents',()=>{
 const crypto=require('node:crypto'),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
 const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/academic-outside-module1-hashes.json'),'utf8'));
 for(const x of c.lessons.filter(x=>x.moduleId!=='ac-foundations'))assert.equal(hash(plain(x)),baseline[x.id],x.id);
});
test('Eleven concrete videos have ten main and one additional Ukrainian guide; playback remains unverified',()=>{
 assert.equal(c.videos.length,11);assert.equal(foundations.flatMap(x=>x.videoGuides).filter(x=>x.role==='main').length,10);
 assert.equal(foundations.flatMap(x=>x.videoGuides).filter(x=>x.role==='additional').length,1);
 for(const v of c.videos){assert.equal(v.playbackStatus,'not_tested');assert.equal(v.language,'en');assert.doesNotMatch(v.url,/results|search_query|playlist/)}
 for(const g of foundations.flatMap(x=>x.videoGuides)){assert.equal(g.required,false);assert.equal(g.questionsUk.length,3);assert.ok(g.keyIdeasUk.length>=3);assert.ok(/[іїєґ]/i.test(g.whyUk))}
});
for(const [name,change] of [
 ['video search URL',x=>x.videos[0].url='https://www.youtube.com/results?search_query=psychology'],
 ['video playlist',x=>x.videos[0].url+='&list=PL123'],
 ['unidentified video',x=>x.videos[0].author=''],
 ['unverified video text',x=>x.videos[0].verificationStatus='candidate'],
 ['missing duration',x=>x.videos[0].durationSeconds=0],
 ['orphan video guide',x=>x.lessons[0].videoGuides[0].videoId='missing'],
 ['required online video',x=>x.lessons[0].videoGuides[0].required=true],
 ['empty active viewing',x=>x.lessons[0].videoGuides[0].questionsUk=[]],
 ['missing main video',x=>x.lessons[0].videoGuides=[]],
 ['duplicate review unit',x=>x.lessons[1].reviewUnits[0].id=x.lessons[0].reviewUnits[0].id],
 ['dictionary-only review',x=>x.lessons[0].reviewUnits.forEach(u=>u.kind='definition')],
 ['unknown review source',x=>x.lessons[0].reviewUnits[0].sourceIds=['missing']],
 ['uncovered objective',x=>x.lessons[0].objectives.push({id:'module-one-uncovered',text:'Нова ціль'})]
])test('Module 1 publication gate rejects '+name,()=>{const bad=plain(c);change(bad);assert.throws(()=>k.validateContent(bad))});
test('All ten video guides and review unit panels render without external players or automatic card seeding',()=>{
 const h=setup(),cards=plain(h.api.state.cards);
 for(const lesson of foundations){nav(h,'#academic?lesson='+lesson.id+'&stage=theory');const html=h.nodes.get('main').innerHTML;
  assert.match(html,/Відеосупровід українською/);assert.match(html,/Питання для активного перегляду/);assert.doesNotMatch(html,/<iframe|<video/);
  nav(h,'#academic?lesson='+lesson.id+'&stage=retention');assert.equal((h.nodes.get('main').innerHTML.match(/data-ac-action="unit-card"/g)||[]).length,4)}
 assert.deepEqual(plain(h.api.state.cards),cards);
});
test('Optional video answers debounce, export, escape and reload independently of viewing or stage completion',()=>{
 const h=setup(),key='video-'+l.videoGuides[0].videoId;
 assert.equal(h.api.academic.write(ID,key,'Моя відповідь <img onerror=x>'),true);
 assert.equal(h.api.academic.write(ID,'video-missing','Зайве'),false);
 const backup=h.api.createBackup();assert.equal(backup.state.academic.curricula[CID].lessons[ID].drafts[key],'Моя відповідь <img onerror=x>');
 const re=harness(JSON.stringify(backup.state),{hash:'#academic?lesson='+ID});assert.match(re.nodes.get('main').innerHTML,/&lt;img onerror=x&gt;/);
 const empty=setup();empty.api.academic.write(ID,'opening','Моя гіпотеза');assert.equal(empty.api.academic.action('complete',{}),true);assert.equal(rec(empty).drafts[key],undefined);
});
test('Review units prepare editable cards and persist their links only on explicit form submission',()=>{
 const h=setup('#academic?lesson='+ID+'&stage=retention'),unit=l.reviewUnits[1],old=plain(h.api.state.cards);
 assert.equal(h.api.academic.action('unit-card',{unit:'missing'}),false);
 assert.equal(h.api.academic.action('unit-card',{unit:unit.id}),true);assert.deepEqual(plain(h.api.state.cards),old);
 assert.equal(h.nodes.get('card-front').value,unit.promptUk.slice(0,300));assert.equal(h.nodes.get('card-back').value,unit.answerUk.slice(0,2000));
 const form=h.nodes.get('study-card-form');form.formValues={front:'Моє уточнене питання',back:unit.answerUk,module:'0'};
 event(h,'submit',form);const card=h.api.state.cards.find(x=>x.academicUnitId===unit.id);
 assert.ok(card);assert.equal(card.academicLessonId,ID);assert.equal(card.module,0);assert.equal(card.front,'Моє уточнене питання');
 for(const x of old)assert.deepEqual(plain(h.api.state.cards.find(y=>y.id===x.id)),x);
 const decoded=h.api.decodeBackup(JSON.stringify(h.api.createBackup()));assert.equal(decoded.cards.find(x=>x.id===card.id).academicUnitId,unit.id);
 assert.equal(h.api.academic.action('unit-card',{unit:unit.id}),true);assert.equal(h.api.state.cards.length,old.length+1);assert.equal(h.context.location.hash,'#cards?entry='+card.id);
});
function oldEditionProfile(){const s=fixture(),at=1794218400000-10*k.DAY;
 s.academic={schemaVersion:1,future:{keep:true},curricula:{[CID]:{lessons:{[ID]:{stage:'assessment',drafts:{open:'Моя стара аргументація',notes:'Старий конспект',review:'Старе пригадування'},choices:{'method-q1':0,'method-q2':1},stageDone:{theory:true},stageScroll:{theory:320},attempts:[{kind:'assessment',at,correct:true,answers:{'method-q1':0,'method-q2':1},contentVersion:'1.0.0'},{kind:'review',at:at+2*k.DAY,correct:true,answers:{'method-review':0},selfRating:'good',contentVersion:'1.0.0'}],demonstratedAt:at,retainedAt:at+2*k.DAY,reviewDueAt:at+6*k.DAY,reviewIntervalDays:4,future:{keep:'old'}}},lastLessonId:ID}}};return s}
test('Old successful two-item edition retains all history and notes without claiming the expanded assessment was passed',()=>{
 const s=oldEditionProfile(),old=s.academic.curricula[CID].lessons[ID],h=harness(JSON.stringify(s),{hash:'#academic?lesson='+ID+'&stage=assessment',now:1794218400000});
 assert.deepEqual(plain(rec(h).attempts),old.attempts);assert.deepEqual(plain(rec(h).drafts),old.drafts);assert.equal(k.evidence(l,rec(h)).demonstratedAt,0);
 assert.equal(k.status(rec(h),l),'attempted');assert.equal(h.api.academic.action('complete',{}),false);
 nav(h,'#academic?lesson='+ID+'&stage=retention');assert.doesNotMatch(h.nodes.get('main').innerHTML,/data-ac-action="review"/);assert.equal(h.api.academic.action('complete',{}),false);
 assert.equal(h.api.academic.action('review',{rating:'good'}),false);assert.deepEqual(plain(rec(h).future),old.future);
 assert.deepEqual(plain(h.api.createBackup().state.academic.future),s.academic.future);
});
test('New edition pass starts its own two-day review while preserving old timestamps, cards and attempts',()=>{
 const s=oldEditionProfile(),old=plain(s.academic.curricula[CID].lessons[ID]),h=harness(JSON.stringify(s),{hash:'#academic?lesson='+ID+'&stage=assessment',now:1794218400000});
 answerAll(h);assert.equal(k.evidence(l,rec(h)).demonstratedAt,h.clock.now);assert.equal(k.evidence(l,rec(h)).retainedAt,0);
 assert.equal(rec(h).demonstratedAt,old.demonstratedAt);assert.equal(rec(h).retainedAt,old.retainedAt);assert.equal(rec(h).reviewDueAt,h.clock.now+2*k.DAY);
 assert.deepEqual(plain(rec(h).attempts.slice(0,2)),old.attempts);assert.deepEqual(plain(h.api.state.cards),s.cards);
 h.api.academic.write(ID,'review','Новий самостійний висновок');h.api.academic.choose(ID,l.review.question.id,l.review.question.answerKey);
 assert.equal(h.api.academic.action('review',{rating:'easy'}),false);h.clock.now+=2*k.DAY;
 assert.equal(h.api.academic.action('review',{rating:'good'}),true);assert.equal(k.status(rec(h),l),'retained');assert.equal(rec(h).attempts.length,4);
});
test('Imported review without a current pass or before two days does not count as retained evidence',()=>{
 const r=plain(oldEditionProfile().academic.curricula[CID].lessons[ID]);r.attempts=[{kind:'review',at:1794218400000,correct:true,selfRating:'good',contentVersion:l.version,answers:{}}];
 assert.equal(k.evidence(l,r).retainedAt,0);r.attempts.unshift({kind:'assessment',at:1794218400000-k.DAY,correct:true,contentVersion:l.version,answers:{}});assert.equal(k.evidence(l,r).retainedAt,0);
});
test('Malformed attempt version and card unit metadata are rejected without changing storage',()=>{
 const h=setup(),before=h.storage.get(KEY),bad=plain(h.api.state);bad.academic.curricula[CID].lessons[ID].attempts=[{kind:'assessment',at:1,correct:true,answers:{},contentVersion:{}}];
 assert.throws(()=>h.api.decodeBackup(JSON.stringify(bad)));const badCard=plain(h.api.state);badCard.cards[0].academicUnitId={};assert.throws(()=>h.api.decodeBackup(JSON.stringify(badCard)));assert.equal(h.storage.get(KEY),before);
});
test('Search includes specific video metadata and newly authored lecture concepts',()=>{
 const h=setup();assert.ok(h.api.commandMatches('Hank Green').some(x=>x.type==='Навчальне відео'));
 assert.ok(h.api.commandMatches('відтворюваність').some(x=>x.target.includes('ay1-replication')));
});
