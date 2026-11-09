import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { publicConfig, configScript } from '../scripts/public-config.mjs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const require=createRequire(import.meta.url);
const root=new URL('../',import.meta.url);
const publicKey='sb_publishable_test_public';
test('Build config accepts publishable/legacy anon keys and only the two public variables',()=>{
 const config=publicConfig({SUPABASE_URL:'https://example.supabase.co/',SUPABASE_ANON_KEY:publicKey,PRIVATE_SECRET:'DO NOT SHIP'});
 assert.equal(config.SUPABASE_URL,'https://example.supabase.co');assert.equal(config.SUPABASE_ANON_KEY,publicKey);assert.doesNotMatch(configScript(config),/DO NOT SHIP|PRIVATE_SECRET/);
 const anon='header.'+Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')+'.signature';assert.equal(publicConfig({SUPABASE_URL:config.SUPABASE_URL,SUPABASE_ANON_KEY:anon}).SUPABASE_ANON_KEY,anon);
});
test('Privileged keys, incomplete config and unsafe URLs fail instead of shipping credentials',()=>{
 const service='header.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.signature';
 for(const key of ['sb_secret_DO_NOT_SHIP',service,'bad-key'])assert.throws(()=>publicConfig({SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:key}));
 for(const url of ['javascript:alert(1)','http://example.com','https://secret@example.com','https://example.com/?key=private'])assert.throws(()=>publicConfig({SUPABASE_URL:url,SUPABASE_ANON_KEY:publicKey}));
 assert.throws(()=>publicConfig({SUPABASE_URL:'https://example.com'}));assert.deepEqual(publicConfig({}),{SUPABASE_URL:'',SUPABASE_ANON_KEY:''});
});
test('Local development supports localhost and generated config executes without code injection',()=>{
 assert.equal(publicConfig({SUPABASE_URL:'http://localhost:54321',SUPABASE_ANON_KEY:publicKey}).SUPABASE_URL,'http://localhost:54321');
 const ctx={window:{}};vm.runInNewContext(configScript({SUPABASE_URL:'<script>',SUPABASE_ANON_KEY:'";evil()//'}),ctx);assert.equal(ctx.window.RIK_CONFIG.SUPABASE_URL,'<script>');assert.ok(Object.isFrozen(ctx.window.RIK_CONFIG));
});
test('The production build bundles the SDK locally, includes all shell files and changes SW when config changes',async()=>{
 const env={...process.env,RIK_SKIP_LOCAL_ENV:'1',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:publicKey};
 execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root,env,stdio:'pipe'});
 const sw=await readFile(new URL('dist/service-worker.js',root),'utf8');
 const runtime=await readFile(new URL('dist/runtime-config.js',root),'utf8');const bundle=await readFile(new URL('dist/auth.js',root),'utf8');
 assert.match(runtime,/sb_publishable_test_public/);assert.match(bundle,/signInWithPassword/);assert.doesNotMatch(bundle,/from[ '\"]+https?:\/\//);
 const shell=[...sw.match(/const SHELL = \[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);assert.equal(shell.length,9);
 for(const file of [...shell,'service-worker.js'])assert.ok((await stat(new URL('dist/'+file,root))).size>0);
 const fingerprint=createHash('sha256').update(bundle).update(runtime).update(await readFile(new URL('service-worker.js',root),'utf8'));
 for(const file of ['index.html','manifest.webmanifest','icon-192.png','icon-512.png','content/curriculum.js','content/academic-core.js','content/academic-ui.js'])fingerprint.update(await readFile(new URL(file,root)));
 assert.ok(sw.includes(fingerprint.digest('hex').slice(0,16)),'content and both code assets participate in the release fingerprint');
 const html=await readFile(new URL('dist/index.html',root),'utf8');assert.match(html,/<script defer src="\.\/runtime-config.js"><\/script>\s*<script defer src="\.\/auth.js">/);
 execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root,env:{...env,SUPABASE_ANON_KEY:'sb_publishable_changed'},stdio:'pipe'});
 assert.notEqual((await readFile(new URL('dist/service-worker.js',root),'utf8')).match(/const BUILD = '([^']+)'/)[1],sw.match(/const BUILD = '([^']+)'/)[1]);
 // Leave the workspace with a usable unconfigured build, not test credentials.
 execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root,env:{...env,SUPABASE_URL:'',SUPABASE_ANON_KEY:''},stdio:'pipe'});
});
test('Auth markup has labels, no persisted password binding and participates in update/keyboard guards',async()=>{
 const html=await readFile(new URL('index.html',root),'utf8');
 assert.match(html,/<dialog id="auth-dialog" aria-labelledby="auth-title"/);assert.match(html,/for="auth-email"/);assert.match(html,/for="auth-password"/);
 const input=html.match(/<input[^>]+id="auth-password"[^>]+>/)[0];assert.doesNotMatch(input,/data-bind|data-tool-field/);assert.match(input,/type="password"/);
 assert.match(html,/#auth-dialog'\)\)\|\|/);assert.match(html,/\$\('#auth-dialog'\).*\.open/);
 const {harness}=require('./stage2.test.cjs');const h=harness();assert.equal(typeof h.context.RikStudy.prepareAuthRedirect,'function');
 h.context.document.querySelectorAll=q=>q.startsWith('form ')?[{tagName:'INPUT',type:'text',dataset:{},value:'draft',defaultValue:'',closest:()=>null}]:[];
 assert.equal(h.context.RikStudy.prepareAuthRedirect(),false);
});
