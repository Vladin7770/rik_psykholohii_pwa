'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ctx={};vm.createContext(ctx);
vm.runInContext(html.match(/var MODS=(\[[\s\S]*?\n\]);/)[0],ctx);
const mods=ctx.MODS;let topics=0,links=0,searches=0;
let out='# Аудит попередньої програми\n\nЗнімок вихідного змісту `MODS`, базовий Git `7b320ab`, 9 листопада 2026 року. Особисте сховище браузера не читалося.\n\n';
for(const [i,m] of mods.entries()){
 out+=`## m${i+1}. ${m.title}\n\n`;
 out+='| Сталий ключ теми | Назва |\n|---|---|\n';
 m.topics.forEach((t,j)=>{topics++;out+=`| ${i+1}-${j} | ${t} |\n`});
 out+='\n| ID ресурсу | Назва | Тип посилання | URL |\n|---|---|---|---|\n';
 m.res.forEach((g,gi)=>g[1].forEach((r,j)=>{links++;const search=r[2].includes('youtube.com/results?');if(search)searches++;out+=`| yt-res-${i+1}-${gi}-${j} | ${r[0]} | ${search?'Пошук YouTube; джерело не перевірено':'Конкретне посилання; зміст у цьому аудиті не перевірявся'} | ${r[2]} |\n`}));out+='\n';
}
vm.runInContext(html.slice(html.indexOf('var SP='),html.indexOf('/* ───────── Стартовий навчальний контент')),ctx);
out+='## Окремі ресурси MEDIA\n\nКонкретні URL з вихідного коду. Цей інвентар не означає перевірку їхнього змісту.\n\n| ID | Назва | URL |\n|---|---|---|\n';
for(const [n,rows] of Object.entries(ctx.MEDIA))rows.forEach((r,j)=>{out+=`| builtin-media-${n}-${j} | ${r[0]} | ${r[2]} |\n`});out+='\n';
out+=`## Підсумок\n\n${mods.length} модулів, ${topics} тем, ${links} тематичні посилання в MODS, ${searches} пошукових посилань YouTube. Окремий MEDIA додає 28 ресурсів: у вихідному застосунку разом 121 ресурс. Банк — 60 тестів і 120 карток. Це не 88 повних лекцій.\n\n`;
out+='Наявні інструменти: картки й інтервали, тести, Фейнман, карта понять, сесії та таймери, дослідження, кейси, критичні вправи, нотатки, щоденник, аналітика, календар, пошук, читання, відновлення, PWA, необов’язковий Auth. Auth не синхронізує навчальні дані.\n\nРизики: переозначення m1…m12, перезапис unknown fields, старі інтервали карток, імпорт пошкодженого стану, вкладки з різними версіями, неповний SW-кеш, незбережена форма перед OAuth. Новий шар додає лише academic і зв’язки academicLessonId; не мігрує старі теми. Старі маршрути збережені.\n';
fs.writeFileSync(path.join(root,'LEGACY_CURRICULUM_AUDIT.md'),out);
console.log(JSON.stringify({modules:mods.length,topics,links,searches}));
