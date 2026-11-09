import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { authStorageKey, authErrorMessage, cachedUser, createAuthController } from '../src/auth-controller.mjs';
import { createBrowserClient } from '../src/auth-client.mjs';

const URL = 'https://auth-test.supabase.co';
const ORIGIN = 'https://study.example';
const USER = { id: 'user-1', email: 'student@example.com' };
const KEY = authStorageKey(URL);
function storage(initial) {
  const map = new Map(initial ? [[KEY, JSON.stringify(initial)]] : []);
  return { map, getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) };
}
function fixture({ initial, online = true, getUser, methods = {}, beforeRedirect } = {}) {
  const store = storage(initial), calls = [], scheduled = new Map();
  let connected = online, listener, disposed = false, nextID = 0;
  const emit = (event, session) => listener(event, session);
  const auth = {
    onAuthStateChange(fn) { listener=fn;return { data: { subscription: { unsubscribe() { disposed=true; } } } }; },
    async getUser() { calls.push(['getUser']);return getUser ? getUser() : { data: { user: initial?.user || null }, error: null }; },
    async signInWithPassword(input) { calls.push(['signin',input]);store.setItem(KEY,JSON.stringify({user:USER}));emit('SIGNED_IN',{user:USER});return {data:{user:USER,session:{user:USER}},error:null}; },
    async signUp(input) { calls.push(['signup',input]);return {data:{user:USER,session:null},error:null}; },
    async signInWithOAuth(input) { calls.push(['google',input]);return {data:{url:'https://accounts.google.com/'},error:null}; },
    async signOut(input) { calls.push(['signout',input]);store.removeItem(KEY);emit('SIGNED_OUT',null);return {error:null}; },
    async startAutoRefresh(){calls.push(['startRefresh']);},async stopAutoRefresh(){calls.push(['stopRefresh']);},
    ...methods,
  };
  const api=createAuthController({client:{auth},storage:store,storageKey:KEY,origin:ORIGIN,
    isOnline:()=>connected,beforeRedirect,schedule:fn=>{const id=++nextID;scheduled.set(id,fn);return id;},cancel:id=>scheduled.delete(id)});
  return {api,auth,store,calls,emit,scheduled,setOnline:v=>connected=v,get disposed(){return disposed;},
    async flush(){const callbacks=[...scheduled.values()];scheduled.clear();for(const fn of callbacks)fn();await Promise.resolve();await Promise.resolve();}};
}

test('Startup checks getUser and exposes no auth tokens in public state',async()=>{
 const h=fixture({initial:{user:USER,access_token:'private-token',refresh_token:'private-refresh'}});await h.api.ready;
 assert.equal(h.calls[0][0],'getUser');assert.equal(h.api.getState().verified,true);assert.deepEqual(h.api.getState().user,USER);
 assert.doesNotMatch(JSON.stringify(h.api.getState()),/private-token|private-refresh/);h.api.dispose();assert.equal(h.disposed,true);
});
test('getUser without a session remains a quiet guest',async()=>{
 const h=fixture({getUser:async()=>({data:{user:null},error:{name:'AuthSessionMissingError'}})});await h.api.ready;
 assert.equal(h.api.getState().status,'guest');assert.equal(h.api.getState().error,'');
});
test('Expired and valid cached profiles both reopen offline without a server check',async()=>{
 for(const expires_at of [1,Math.floor(Date.now()/1000)+3600]){
  const h=fixture({initial:{user:USER,expires_at},online:false});await h.api.ready;
  assert.equal(h.calls.length,0);assert.equal(h.api.getState().status,'offline');assert.equal(h.api.getState().verified,false);assert.equal(h.api.getState().user.id,USER.id);
 }
});
test('Forged cached data is never treated as a verified login',async()=>{
 const h=fixture({initial:{user:{id:'forged',email:'<img src=x>'}},online:false});await h.api.ready;
 assert.equal(h.api.getState().verified,false);assert.equal(cachedUser(storage({user:{email:'missing id'}}),KEY),null);
});
test('Email login calls official password method and does not trim the password',async()=>{
 const h=fixture();await h.api.ready;const result=await h.api.signIn('  student@example.com  ',' password ');
 assert.equal(result.ok,true);assert.deepEqual(h.calls.find(c=>c[0]==='signin')[1],{email:USER.email,password:' password '});assert.equal(h.api.getState().verified,true);
});
test('Malformed email, missing password and short registration password never reach the SDK',async()=>{
 const h=fixture();await h.api.ready;
 for(const [email,pw,signup] of [['wrong','password',false],[USER.email,'',false],[USER.email,'123',true]]){
  assert.equal((await (signup?h.api.signUp(email,pw):h.api.signIn(email,pw))).ok,false);
 }
 assert.equal(h.calls.filter(c=>['signin','signup'].includes(c[0])).length,0);
});
test('Invalid password uses Ukrainian error and the user stays logged out',async()=>{
 const h=fixture({methods:{async signInWithPassword(){return {error:{code:'invalid_credentials'}};}}});await h.api.ready;
 assert.equal((await h.api.signIn(USER.email,'wrong')).ok,false);assert.match(h.api.getState().error,/Неправильний email або пароль/);assert.equal(h.api.getState().user,null);assert.equal(h.api.getState().busy,false);
});
test('Confirmation-required signup does not sign in the returned user',async()=>{
 const h=fixture();await h.api.ready;const result=await h.api.signUp(USER.email,'password');
 assert.equal(result.ok,true);assert.equal(result.confirmationRequired,true);assert.equal(h.api.getState().user,null);assert.match(h.api.getState().message,/підтвердь email/);
 assert.equal(h.calls.find(c=>c[0]==='signup')[1].options.emailRedirectTo,ORIGIN);
});
test('Signup with a real session displays the signed-in profile',async()=>{
 const h=fixture({methods:{async signUp(){return {data:{session:{user:USER}},error:null};}}});await h.api.ready;
 assert.equal((await h.api.signUp(USER.email,'password')).confirmationRequired,false);assert.equal(h.api.getState().user.id,USER.id);
});
test('Google redirect uses the exact current origin and first saves learning drafts',async()=>{
 const order=[];const h=fixture({beforeRedirect:()=>{order.push('save');return true;},methods:{async signInWithOAuth(input){order.push('oauth');assert.deepEqual(input,{provider:'google',options:{redirectTo:ORIGIN}});return {data:{},error:null};}}});await h.api.ready;
 assert.equal((await h.api.signInWithGoogle()).ok,true);assert.deepEqual(order,['save','oauth']);
});
test('Google does not redirect while an unrelated form or storage problem blocks saving',async()=>{
 const h=fixture({beforeRedirect:()=>false});await h.api.ready;assert.equal((await h.api.signInWithGoogle()).ok,false);assert.equal(h.calls.some(c=>c[0]==='google'),false);
});
test('Offline login, signup and Google fail immediately without API requests',async()=>{
 const h=fixture({online:false});await h.api.ready;
 for(const action of [()=>h.api.signIn(USER.email,'password'),()=>h.api.signUp(USER.email,'password'),()=>h.api.signInWithGoogle()])assert.equal((await action()).ok,false);
 assert.equal(h.calls.length,0);assert.match(h.api.getState().error,/інтернет/);
});
test('Local signOut clears only the SDK session and preserves learning state',async()=>{
 const h=fixture({initial:{user:USER}});h.store.setItem('psykholohiia-rik-v1','MY STUDY DATA');await h.api.ready;
 assert.equal((await h.api.signOut()).ok,true);assert.deepEqual(h.calls.find(c=>c[0]==='signout')[1],{scope:'local'});
 assert.equal(h.api.getState().user,null);assert.equal(h.store.getItem(KEY),null);assert.equal(h.store.getItem('psykholohiia-rik-v1'),'MY STUDY DATA');
});
test('Offline signOut reports local success if the SDK removed its session before network failure',async()=>{
 const h=fixture({initial:{user:USER},online:false});await h.api.ready;
 h.auth.signOut=async()=>{h.store.removeItem(KEY);h.emit('SIGNED_OUT',null);return {error:{name:'AuthRetryableFetchError'}};};
 assert.equal((await h.api.signOut()).ok,true);assert.equal(h.api.getState().user,null);assert.match(h.api.getState().message,/Серверне відкликання/);
});
test('A failed logout that leaves SDK credentials keeps the profile visible',async()=>{
 const h=fixture({initial:{user:USER},methods:{async signOut(){return {error:{name:'AuthRetryableFetchError'}};}}});await h.api.ready;
 assert.equal((await h.api.signOut()).ok,false);assert.equal(h.api.getState().user.id,USER.id);
});
test('onAuthStateChange handles another-tab login, refresh and logout without calling SDK inside the callback',async()=>{
 let user=USER;const h=fixture({getUser:async()=>({data:{user},error:null})});await h.api.ready;h.calls.length=0;
 h.emit('SIGNED_IN',{user});assert.equal(h.calls.length,0);assert.equal(h.api.getState().verified,false);await h.flush();assert.equal(h.api.getState().verified,true);
 h.emit('TOKEN_REFRESHED',{user});assert.equal(h.api.getState().status,'checking');await h.flush();assert.equal(h.api.getState().verified,true);
 h.emit('SIGNED_OUT',null);assert.equal(h.api.getState().user,null);
});
test('Stale getUser cannot resurrect a user after logout in another tab',async()=>{
 let resolve;const h=fixture({initial:{user:USER},getUser:()=>new Promise(r=>resolve=r)});h.emit('SIGNED_OUT',null);resolve({data:{user:USER},error:null});await h.api.ready;
 assert.equal(h.api.getState().user,null);assert.equal(h.api.getState().status,'guest');
});
test('Connection recovery revalidates the cached user and restarts token refresh',async()=>{
 const h=fixture({initial:{user:USER},online:false});await h.api.ready;h.setOnline(true);await h.api.connectionChanged();
 assert.equal(h.api.getState().verified,true);assert.ok(h.calls.some(c=>c[0]==='startRefresh'));h.setOnline(false);await h.api.connectionChanged();assert.equal(h.api.getState().verified,false);assert.ok(h.calls.some(c=>c[0]==='stopRefresh'));
});
test('Temporary server/network failure keeps only an explicitly unverified cached profile',async()=>{
 const h=fixture({initial:{user:USER},getUser:async()=>({error:{name:'AuthRetryableFetchError'},data:{user:null}})});await h.api.ready;
 assert.equal(h.api.getState().user.id,USER.id);assert.equal(h.api.getState().status,'unverified');assert.equal(h.api.getState().verified,false);
});
test('Parallel button clicks submit only one auth operation',async()=>{
 let resolve;const h=fixture({methods:{signInWithPassword(){return new Promise(r=>resolve=r);}}});await h.api.ready;
 const first=h.api.signIn(USER.email,'password');assert.equal(h.api.getState().busy,true);assert.equal((await h.api.signUp(USER.email,'password')).ok,false);resolve({data:{user:USER},error:null});await first;assert.equal(h.api.getState().busy,false);
});
test('Known errors are translated without echoing arbitrary server text',()=>{
 for(const code of ['email_not_confirmed','weak_password','over_email_send_rate_limit','provider_disabled'])assert.ok(authErrorMessage({code}).length>10);
 assert.doesNotMatch(authErrorMessage({message:'<img onerror=evil> secret'}),/evil|secret/);
 assert.match(authErrorMessage({status:429}),/Забагато/);
});
test('SDK storage key is per project and never collides with the study profile',()=>{
 assert.notEqual(KEY,'psykholohiia-rik-v1');assert.notEqual(KEY,authStorageKey('https://other.supabase.co'));
});
test('Cold offline start defers the official SDK and leaves its expired session and study data intact',async()=>{
 const store=storage({user:USER,access_token:'cached-token',refresh_token:'cached-refresh',expires_at:1,token_type:'bearer'});
 store.setItem('psykholohiia-rik-v1','ORIGINAL');let requests=0;
 const client=createBrowserClient({createClient:()=>{requests++;throw new Error('SDK must be deferred');},config:{SUPABASE_URL:URL},storage:store,online:false});
 assert.equal(client,null);assert.equal(requests,0);assert.equal(cachedUser(store,KEY).id,USER.id);assert.equal(store.getItem('psykholohiia-rik-v1'),'ORIGINAL');assert.equal(JSON.parse(store.getItem(KEY)).expires_at,1);
});
test('Real official SDK restores an online session and getUser verifies it through the API',async()=>{
 const token=['header',Buffer.from(JSON.stringify({sub:USER.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'signature'].join('.');
 const store=storage({user:USER,access_token:token,refresh_token:'cached-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer'});const requests=[];
 const client=createBrowserClient({createClient,config:{SUPABASE_URL:URL,SUPABASE_ANON_KEY:'sb_publishable_test'},storage:store,online:true,fetch:async(url)=>{requests.push(String(url));return new Response(JSON.stringify(USER),{status:200,headers:{'Content-Type':'application/json'}});}});
 const h=createAuthController({client,storage:store,storageKey:KEY,origin:ORIGIN});
 try {await h.ready;await h.verifyUser();assert.equal(h.getState().verified,true);assert.equal(h.getState().user.id,USER.id);assert.ok(requests.some(url=>url.endsWith('/auth/v1/user')));}
 finally {h.dispose();await client.auth.dispose();}
});
