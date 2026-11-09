/* Pure course rules. No storage, network, authentication, timers or XP. */
window.RikAcademicCore = (function(){
'use strict';
var DAY=86400000,stages=['theory','perspectives','evidence','case','thinking','assessment','retention'];
var labels=['Теорія','Різні погляди','Наукові докази','Практичний аналіз','Власне мислення','Перевірка','Закріплення'];
var record=function(v){return !!v&&typeof v==='object'&&!Array.isArray(v)};
var own=function(o,k){return Object.prototype.hasOwnProperty.call(o,k)};
function fail(message){throw new Error('Академічна програма: '+message)}
function safeId(x){return typeof x==='string'&&/^[a-z][a-z0-9-]{2,100}$/.test(x)&&!['constructor','prototype'].includes(x)}
function safeURL(x){try{var u=new URL(x);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch(e){return ''}}
function text(x){return typeof x==='string'&&x.trim().length>0}
function strings(x){return Array.isArray(x)&&x.every(text)}
function validateContent(c){
 if(!record(c)||!safeId(c.id)||!text(c.version)||c.language!=='uk'||c.modules.length!==12)fail('невалідна схема курсу');
 var modules=new Map(),lessons=new Map(),sources=new Map(),terms=new Map(),questions=new Set();
 function collect(list,map){if(!Array.isArray(list))fail('немає колекції');list.forEach(function(x){if(!record(x)||!safeId(x.id)||map.has(x.id))fail('повторений або хибний ID');map.set(x.id,x)})}
 collect(c.modules,modules);collect(c.lessons,lessons);collect(c.sources,sources);collect(c.glossary,terms);
 sources.forEach(function(s){if(!text(s.title)||!strings(s.authors)||!safeURL(s.url))fail('джерело '+s.id);if(s.verificationStatus==='selected_claims_checked'&&(!s.verifiedAt||s.existenceStatus!=='verified'||s.readingStatus==='not_read'))fail('неправдива перевірка джерела')});
 function refs(ids,map){if(!Array.isArray(ids)||ids.some(function(id){return !map.has(id)}))fail('недосяжне посилання')}
 var placements=[];
 modules.forEach(function(m){if(!text(m.titleUk)||!text(m.goal)||!strings(m.competencies)||m.competencies.length<3||!strings(m.integrativeTasks)||m.integrativeTasks.length<2)fail('модуль '+m.id);refs(m.prerequisites,modules);refs(m.lessonIds,lessons);refs(m.sourceIds,sources);m.lessonIds.forEach(function(id){placements.push(id);if(lessons.get(id).moduleId!==m.id)fail('розміщення уроку')})});
 if(placements.length!==lessons.size||new Set(placements).size!==placements.length)fail('урок відсутній або дубльований у модулі');
 function acyclic(map,key){var active=new Set(),done=new Set();function visit(id){if(active.has(id))fail('цикл передумов');if(done.has(id))return;active.add(id);map.get(id)[key].forEach(visit);active.delete(id);done.add(id)}map.forEach(function(_,id){visit(id)})}
 var paragraphs=new Set();
 lessons.forEach(function(l){refs(l.prerequisiteLessonIds,lessons);refs(l.relatedLessonIds,lessons);refs(l.references,sources);if(!modules.has(l.moduleId)||!text(l.titleUk)||!Array.isArray(l.objectives)||l.objectives.length<2)fail('схема уроку '+l.id);
  if(!['planned','pilot','published'].includes(l.publicationStatus))fail('статус публікації');
  if(l.editorialStatus==='reviewed'&&(!record(l.independentReview)||!text(l.independentReview.reviewer)||!text(l.independentReview.at)))fail('немає незалежної рецензії');
  if(l.publicationStatus==='planned')return;
  if(!['scientific_review_needed','source_checked','reviewed'].includes(l.editorialStatus))fail('редакційний статус');
  ['whyUk','openingQuestionUk','thinkingPromptUk','summaryUk'].forEach(function(k){if(!text(l[k]))fail('порожнє поле '+k)});
  if(!record(l.readingLevels)||!strings(l.readingLevels.simple)||!strings(l.readingLevels.deep)||l.readingLevels.standard!=='sections')fail('рівні читання');
  ['sections','perspectiveComparisons','evidenceNotes'].forEach(function(k){if(!Array.isArray(l[k])||!l[k].length)fail('порожня лекція');l[k].forEach(function(b){if(!text(b.titleUk)||!strings(b.paragraphs)||!b.paragraphs.length||!strings(b.sourceIds)||!b.sourceIds.length)fail('порожній блок');refs(b.sourceIds,sources);b.paragraphs.forEach(function(p){if(p.length<70||/TODO|Lorem ipsum|текст буде додано/i.test(p)||paragraphs.has(p))fail('порожній шаблон або дубль');paragraphs.add(p)})})});
  if(!strings(l.examples)||l.examples.length<2||!strings(l.misconceptions)||!l.misconceptions.length||!strings(l.critiqueUk)||!l.critiqueUk.length)fail('приклади й критика');
  refs(l.glossaryIds,terms);if(l.sections.flatMap(function(b){return b.paragraphs}).join(' ').split(/\s+/).length<600)fail('лекція надто коротка для пілотного стандарту');
  if(!l.glossaryIds.length||!l.lastSourceCheck||!l.references.length)fail('немає словника/джерел');
  if(!l.references.some(function(id){var s=sources.get(id);return s.verificationStatus==='selected_claims_checked'&&s.readingStatus!=='overview_only'}))fail('немає опрацьованого джерела');
  if(l.references.some(function(id){return sources.get(id).verificationStatus!=='selected_claims_checked'}))fail('неперевірене джерело опублікованого уроку');
  if(!record(l.caseStudy)||!text(l.caseStudy.textUk)||!strings(l.caseStudy.prompts)||!text(l.caseStudy.modelUk))fail('кейс');
  if(!record(l.openAssessment)||!text(l.openAssessment.promptUk)||!text(l.openAssessment.modelUk)||!strings(l.openAssessment.rubric)||l.openAssessment.rubric.length<3)fail('відкрите оцінювання');
  if(!record(l.review)||!text(l.review.promptUk)||!text(l.review.modelUk))fail('повторення');
  if(!Array.isArray(l.assessments)||l.assessments.length<2)fail('немає оцінювання');
  l.assessments.concat([l.review.question]).forEach(function(q){if(!q||!safeId(q.id)||questions.has(q.id)||q.type!=='single_choice'||!text(q.promptUk)||!strings(q.choices)||q.choices.length<3||!Number.isInteger(q.answerKey)||!q.choices[q.answerKey]||!strings(q.explanationsUk)||q.explanationsUk.length!==q.choices.length)fail('питання');questions.add(q.id);refs(q.sourceIds,sources);if(!q.objectiveIds.length||q.objectiveIds.some(function(id){return !l.objectives.some(function(o){return o.id===id})}))fail('мета оцінювання')});
 });
 terms.forEach(function(t){if(!text(t.uk)||!text(t.original)||!text(t.definitionUk))fail('словник');refs(t.sourceIds,sources)});
 acyclic(modules,'prerequisites');acyclic(lessons,'prerequisiteLessonIds');return c;
}
function defaultState(){return {schemaVersion:1,curricula:{}}}
function validateState(a){
 if(a===undefined)return;
 if(!record(a)||a.schemaVersion!==1||!record(a.curricula))fail('невалідний навчальний стан');
 Object.keys(a.curricula).forEach(function(cid){var p=a.curricula[cid];if(!safeId(cid)||!record(p)||!record(p.lessons)||(p.lastLessonId!==undefined&&p.lastLessonId!==''&&!safeId(p.lastLessonId)))fail('стан курсу');
 Object.keys(p.lessons).forEach(function(id){var r=p.lessons[id];if(!safeId(id)||!record(r))fail('стан уроку');
 ['lastOpenedAt','scrollPosition','demonstratedAt','retainedAt','reviewDueAt','reviewIntervalDays'].forEach(function(k){if(r[k]!==undefined&&(!Number.isFinite(r[k])||r[k]<0))fail('час або позиція')});
 if(r.stage!==undefined&&!stages.includes(r.stage))fail('етап');
 if(r.readingLevel!==undefined&&!['simple','standard','deep'].includes(r.readingLevel))fail('рівень читання');
 if(r.stageScroll!==undefined&&(!record(r.stageScroll)||Object.keys(r.stageScroll).some(function(k){return !stages.includes(k)||!Number.isFinite(r.stageScroll[k])||r.stageScroll[k]<0})))fail('позиції етапів');
 if(r.stageDone!==undefined&&(!record(r.stageDone)||Object.keys(r.stageDone).some(function(k){return !stages.includes(k)||typeof r.stageDone[k]!=='boolean'})))fail('завершені етапи');
 if(r.drafts!==undefined&&(!record(r.drafts)||Object.values(r.drafts).some(function(v){return typeof v!=='string'})))fail('чернетки');
 if(r.choices!==undefined&&(!record(r.choices)||Object.keys(r.choices).some(function(k){return !safeId(k)||!Number.isInteger(r.choices[k])||r.choices[k]<0||r.choices[k]>10})))fail('вибір відповіді');
 if(r.attempts!==undefined&&(!Array.isArray(r.attempts)||r.attempts.some(function(x){return !record(x)||!Number.isFinite(x.at)||x.at<0||!['assessment','review'].includes(x.kind)||typeof x.correct!=='boolean'||!record(x.answers)||Object.keys(x.answers).some(function(k){return !safeId(k)||!Number.isInteger(x.answers[k])||x.answers[k]<0||x.answers[k]>10})})))fail('спроби');
 });});return a;
}
function lessonState(a,cid,id){var p=a&&a.curricula&&a.curricula[cid];return p&&p.lessons[id]||{}}
function ensure(a,cid,id,now){if(!safeId(cid)||!safeId(id))fail('ID стану');if(!own(a.curricula,cid))a.curricula[cid]={lessons:{},lastLessonId:''};var p=a.curricula[cid];if(!own(p.lessons,id))p.lessons[id]={stage:'theory',drafts:{},choices:{},attempts:[],stageDone:{},stageScroll:{}};var r=p.lessons[id];['drafts','choices','stageDone','stageScroll'].forEach(function(k){if(!r[k])r[k]={}});if(!r.attempts)r.attempts=[];if(now!==undefined){r.lastOpenedAt=now;p.lastLessonId=id}return r}
function status(r){if(r.retainedAt)return 'retained';if(r.demonstratedAt)return 'demonstrated';if(stages.every(function(s){return r.stageDone&&r.stageDone[s]}))return 'completed';if((r.attempts||[]).length||Object.values(r.drafts||{}).some(function(v){return v.trim()}))return 'attempted';return r.lastOpenedAt?'viewed':'unseen'}
function assess(l,r,now){if(!l.assessments.every(function(q){return Number.isInteger(r.choices[q.id])&&q.choices[r.choices[q.id]]!==undefined}))return false;var correct=l.assessments.every(function(q){return r.choices[q.id]===q.answerKey});r.attempts.push({kind:'assessment',at:now,correct:correct,answers:Object.assign({},r.choices),contentVersion:l.version});if(correct&&!r.demonstratedAt){r.demonstratedAt=now;r.reviewDueAt=now+2*DAY;r.reviewIntervalDays=2}return true}
function review(l,r,choice,rating,now){var q=l.review.question;if(!r.demonstratedAt||!r.reviewDueAt||now<r.reviewDueAt||now-r.demonstratedAt<2*DAY||!Number.isInteger(choice)||!q.choices[choice]||!['again','hard','good','easy'].includes(rating)||!r.drafts||!text(r.drafts.review))return false;
 var correct=choice===q.answerKey;r.attempts.push({kind:'review',at:now,correct:correct,answers:{[q.id]:choice},selfRating:rating,contentVersion:l.version});
 if(correct&&['good','easy'].includes(rating))r.retainedAt=now;else delete r.retainedAt;
 var old=r.reviewIntervalDays||2,days=!correct||rating==='again'?1:rating==='hard'?2:rating==='good'?Math.min(30,Math.max(4,old*2)):Math.min(45,Math.max(7,old*3));r.reviewIntervalDays=days;r.reviewDueAt=now+days*DAY;return true}
return {DAY:DAY,stages:stages,stageLabels:labels,safeURL:safeURL,validateContent:validateContent,defaultState:defaultState,validateState:validateState,lessonState:lessonState,ensure:ensure,status:status,assess:assess,review:review};
})();
