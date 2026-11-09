import { createClient } from '@supabase/supabase-js';
import { authStorageKey, cachedUser, createAuthController } from './auth-controller.mjs';
import { createBrowserClient } from './auth-client.mjs';

// One client per page, bundled locally so a CDN is not required offline.
const config = window.RIK_CONFIG || {};
const dialog = document.getElementById('auth-dialog');
const form = document.getElementById('auth-form');
const errorNode = document.getElementById('auth-error');
const statusNode = document.getElementById('auth-status');
const profile = document.getElementById('auth-profile');
let controller = null, setupError = '', opener = null, storage = null;
const configured = !!config.SUPABASE_URL && !!config.SUPABASE_ANON_KEY;
const returnURL = new URL(window.location.href);
const returnedError = returnURL.searchParams.get('error') ||
  new URLSearchParams(returnURL.hash.slice(1)).get('error');
const returnedCode = returnURL.searchParams.has('code');

function networkFetch(input, init = {}) {
  if (navigator.onLine === false) return Promise.reject(new TypeError('Network is offline'));
  const abort = new AbortController();
  const relay = () => abort.abort();
  if (init.signal?.aborted) abort.abort();
  else init.signal?.addEventListener('abort', relay, { once: true });
  const timeout = setTimeout(relay, 15000);
  return fetch(input, { ...init, signal: abort.signal }).finally(() => {
    clearTimeout(timeout); init.signal?.removeEventListener('abort', relay);
  });
}

function authLabel(state) {
  if (!configured || setupError) return 'Вхід ще не налаштовано';
  if (state.status === 'checking') return 'Перевіряємо вхід…';
  if (state.user && state.status === 'offline') return 'Збережений вхід · офлайн';
  if (state.user && !state.verified) return 'Збережений профіль · перевірка недоступна';
  if (state.user) return 'Вхід виконано';
  return state.online ? 'Локальне навчання без входу' : 'Локальне навчання · офлайн';
}

function render() {
  const state = controller?.getState() || {
    user: storage ? cachedUser(storage, authStorageKey(config.SUPABASE_URL)) : null,
    online: navigator.onLine !== false, status: navigator.onLine === false ? 'offline' : 'checking',
    busy: false, verified: false,
  };
  const hasUser = !!state.user;
  form.hidden = hasUser;
  profile.hidden = !hasUser;
  errorNode.textContent = setupError || state.error || '';
  statusNode.textContent = state.message || authLabel(state);
  const email = document.getElementById('auth-user-email');
  email.textContent = state.user?.email || (hasUser ? 'Акаунт Supabase' : '');
  document.getElementById('auth-session-label').textContent = authLabel(state);
  document.getElementById('auth-offline-note').hidden = !(hasUser && !state.verified);
  if (hasUser) form.elements.password.value = '';
  form.setAttribute('aria-busy', String(!!state.busy));
  for (const control of form.querySelectorAll('input,button')) {
    control.disabled = !controller || !state.online || state.busy;
  }
  document.getElementById('auth-signout').disabled = !controller || state.busy;
  for (const button of document.querySelectorAll('[data-auth-open]')) {
    button.textContent = hasUser ? 'Профіль' : 'Увійти';
    button.setAttribute('aria-label', hasUser ? 'Відкрити профіль' : 'Відкрити вхід або реєстрацію');
  }
  for (const slot of document.querySelectorAll('[data-auth-account]')) {
    // User data is assigned only through textContent, never interpolated HTML.
    slot.replaceChildren();
    const label = document.createElement('p'); label.className = 'hint';
    label.textContent = hasUser ? state.user.email || 'Акаунт Supabase' : authLabel(state);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'btn small';
    button.dataset.authOpen = ''; button.textContent = hasUser ? 'Профіль' : 'Увійти / Реєстрація';
    slot.append(label, button);
  }
}

function open(trigger) {
  opener = trigger;
  // Release the mobile navigation focus trap before opening a modal.
  window.RikStudy?.closeMenu();
  render();
  if (!dialog.open) dialog.showModal();
  const input = !form.hidden && !form.elements.email.disabled ? form.elements.email : document.getElementById('auth-close');
  input.focus();
}
function close() {
  form.elements.password.value = '';
  dialog.close();
  // Navigation is re-rendered frequently; the old trigger may no longer exist.
  const target = opener?.isConnected ? opener : document.querySelector('[data-auth-open]');
  target?.focus({ preventScroll: true });
}

function initializeClient() {
  if (controller || !configured || !storage || navigator.onLine === false) return;
  try {
    const client = createBrowserClient({ createClient, config, storage,
      online: navigator.onLine !== false, fetch: networkFetch });
    window.rikSupabase = client;
    controller = createAuthController({ client, storage,
      storageKey: authStorageKey(config.SUPABASE_URL), origin: window.location.origin,
      isOnline: () => navigator.onLine !== false,
      isVisible: () => document.visibilityState !== 'hidden',
      beforeRedirect: () => window.RikStudy?.prepareAuthRedirect() !== false,
    });
    controller.subscribe(render);
    // initialize() reuses the SDK's existing initialization promise; it does
    // not exchange the PKCE code twice. Surface callback failures after getUser.
    if (returnedCode || returnedError) {
      void Promise.all([controller.ready, client.auth.initialize()]).then(([, result]) => {
        if (result.error || returnedError || !controller.getState().user) {
          controller.reportError(result.error || { code: returnedError || 'code_exchange_failed' });
          open(null);
        }
      }).catch(() => { controller.reportError({ code: 'code_exchange_failed' }); open(null); });
    }
  } catch {
    setupError = 'Не вдалося підготувати вхід. Перевір налаштування браузера й сайту. Локальні записи не змінено.';
  }
}
try {
  if (!configured) {
    setupError = 'Вхід ще не підключено. Власнику сайту потрібно додати налаштування Supabase у Vercel. Навчання доступне без входу.';
  } else {
    storage = window.localStorage;
    const probe = authStorageKey(config.SUPABASE_URL) + ':probe';
    storage.setItem(probe, '1'); storage.removeItem(probe);
    initializeClient();
  }
} catch {
  setupError = 'Не вдалося підготувати вхід або сховище сесії. Перевір налаштування браузера й сайту. Локальні записи не змінено.';
}

// Public integration API. Tokens stay inside the official SDK storage.
window.RikAuth = { get controller() { return controller; }, render, open, close };
render();
async function connectionChanged() {
  initializeClient();
  if (controller) await controller.connectionChanged(); else render();
}
for (const event of ['online', 'offline']) window.addEventListener(event, () => void connectionChanged());
document.addEventListener('visibilitychange', () => void connectionChanged());
window.addEventListener('storage', event => {
  // A cold offline tab has no SDK/BroadcastChannel yet. Reflect another tab's
  // logout by rereading the same SDK storage, without creating a second cache.
  if (!controller && storage && (event.key === null || event.key === authStorageKey(config.SUPABASE_URL))) render();
});
document.addEventListener('click', async event => {
  const trigger = event.target.closest('[data-auth-open]');
  if (trigger) { open(trigger); return; }
  if (event.target.closest('[data-auth-close]')) { close(); return; }
  if (event.target === dialog) { close(); return; }
  if (event.target.closest('[data-auth-google]')) {
    form.elements.password.value = '';
    if (controller) await controller.signInWithGoogle();
    return;
  }
  if (event.target.closest('[data-auth-signout]') && controller) await controller.signOut();
});
dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!controller) return;
  const email = form.elements.email.value, password = form.elements.password.value;
  const result = event.submitter?.value === 'signup'
    ? await controller.signUp(email, password) : await controller.signIn(email, password);
  form.elements.password.value = '';
  if (result.ok && !result.confirmationRequired) document.getElementById('auth-close').focus();
});
