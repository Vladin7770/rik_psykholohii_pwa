'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const ctx={window:{},URL};vm.createContext(ctx);
for(const file of ['content/curriculum.js','content/academic-core.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
const c=ctx.window.RikAcademicContent,k=ctx.window.RikAcademicCore;k.validateContent(c);
const pilots=c.lessons.filter(l=>l.publicationStatus!=='planned');
console.log(`${c.modules.length} модулів; ${c.lessons.length} запланованих уроків; ${pilots.length} пілотні тексти. Схема й технічна повнота перевірені; наукову коректність цей тест не доводить.`);
module.exports={c,k};
