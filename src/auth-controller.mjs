// Auth state is separate from the learning profile and its JSON backups.
// Only Supabase writes tokens; cached users are UI hints, never authorization.
export function authStorageKey(url) {
  return 'rik-psykholohii-auth:' + new URL(url).origin;
}

function publicUser(user) {
  return user && typeof user.id === 'string' && user.id
    ? { id: user.id, email: typeof user.email === 'string' ? user.email : '' }
    : null;
}

export function cachedUser(storage, key) {
  try { return publicUser(JSON.parse(storage.getItem(key) || 'null')?.user); }
  catch { return null; }
}

export function authErrorMessage(error, online = true) {
  const code = error?.code || '';
  if (!online || error?.name === 'AuthRetryableFetchError' ||
      ['TypeError', 'AbortError', 'TimeoutError'].includes(error?.name)) {
    return 'Немає з’єднання із сервером. Перевір інтернет і спробуй ще раз.';
  }
  const messages = {
    invalid_credentials: 'Неправильний email або пароль.',
    email_not_confirmed: 'Спочатку підтвердь email за посиланням у листі.',
    email_address_invalid: 'Перевір адресу email.',
    validation_failed: 'Перевір email і пароль.',
    weak_password: 'Пароль не відповідає вимогам безпеки. Спробуй довший та складніший пароль.',
    user_already_exists: 'Реєстрацію не завершено. Спробуй увійти або перевір пошту.',
    email_exists: 'Реєстрацію не завершено. Спробуй увійти або перевір пошту.',
    over_email_send_rate_limit: 'Листи надсилаються надто часто. Зачекай і спробуй пізніше.',
    over_request_rate_limit: 'Забагато спроб. Зачекай трохи й повтори.',
    signup_disabled: 'Реєстрацію тимчасово вимкнено.',
    provider_disabled: 'Вхід через Google ще не налаштовано.',
    oauth_provider_not_supported: 'Вхід через Google ще не налаштовано.',
    access_denied: 'Вхід через Google скасовано або доступ не надано. Можна спробувати знову.',
    code_exchange_failed: 'Не вдалося завершити вхід за посиланням. Почни вхід знову в цьому браузері.',
    bad_code_verifier: 'Посилання входу застаріло. Почни вхід знову в цьому браузері.',
    flow_state_expired: 'Посилання входу застаріло. Почни вхід знову.',
    captcha_failed: 'Не вдалося пройти перевірку входу. Спробуй пізніше.',
  };
  if (error?.status === 429) return messages.over_request_rate_limit;
  return messages[code] || 'Не вдалося виконати вхід. Спробуй ще раз або звернися до власника сайту.';
}

export function createAuthController({ client, storage, storageKey, origin,
  isOnline = () => true, isVisible = () => true, beforeRedirect = () => true,
  schedule = (fn) => setTimeout(fn, 0), cancel = clearTimeout }) {
  let alive = true, generation = 0, verification = 0, queued = null;
  const listeners = new Set();
  let state = {
    user: cachedUser(storage, storageKey), status: isOnline() ? 'checking' : 'offline',
    online: isOnline(), verified: false, busy: false, error: '', message: '',
  };

  function snapshot() { return { ...state, user: state.user && { ...state.user } }; }
  function update(patch) {
    if (!alive) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener(snapshot());
  }
  function fromCache() {
    update({ user: cachedUser(storage, storageKey), status: 'offline',
      online: false, verified: false });
  }
  function queueVerification() {
    if (queued !== null) cancel(queued);
    // Never await another auth method inside onAuthStateChange (SDK lock).
    queued = schedule(() => { queued = null; void verifyUser(); });
  }

  const subscription = client.auth.onAuthStateChange((event, session) => {
    generation++;
    if (event === 'SIGNED_OUT') {
      update({ user: null, status: 'guest', verified: false, error: '' });
      return;
    }
    const user = publicUser(session?.user);
    update({ user, status: isOnline() ? (user ? 'checking' : 'guest') : 'offline',
      online: isOnline(), verified: false });
    if (user && isOnline()) queueVerification();
  }).data.subscription;

  async function verifyUser() {
    if (!alive) return;
    if (!isOnline()) { fromCache(); return; }
    const version = ++verification, sessionGeneration = generation;
    try {
      const { data, error } = await client.auth.getUser();
      if (!alive || version !== verification || sessionGeneration !== generation) return;
      if (!isOnline()) { fromCache(); return; }
      if (error) {
        const missing = error.name === 'AuthSessionMissingError';
        const network = error.name === 'AuthRetryableFetchError' ||
          ['TypeError', 'AbortError', 'TimeoutError'].includes(error.name);
        const user = network ? cachedUser(storage, storageKey) : null;
        update({ user, status: user ? 'unverified' : 'guest', verified: false,
          online: true, error: missing ? '' : authErrorMessage(error) });
        return;
      }
      const user = publicUser(data?.user);
      update({ user, status: user ? 'authenticated' : 'guest',
        online: true, verified: !!user, error: '' });
    } catch (error) {
      if (!alive || version !== verification || sessionGeneration !== generation) return;
      const user = cachedUser(storage, storageKey);
      update({ user, status: isOnline() ? (user ? 'unverified' : 'guest') : 'offline',
        online: isOnline(), verified: false, error: authErrorMessage(error, isOnline()) });
    }
  }

  async function run(action, { offline = false } = {}) {
    if (!alive || state.busy) return { ok: false };
    if (!offline && !isOnline()) {
      update({ error: authErrorMessage(null, false), online: false });
      return { ok: false };
    }
    update({ busy: true, error: '', message: '' });
    try { return await action(); }
    catch (error) { update({ error: authErrorMessage(error, isOnline()) }); return { ok: false }; }
    finally { update({ busy: false }); }
  }
  function credentials(email, password, signup) {
    email = String(email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      update({ error: 'Вкажи коректну адресу email.' }); return null;
    }
    // Do not trim passwords: spaces may be intentional.
    if (typeof password !== 'string' || !password || (signup && password.length < 6)) {
      update({ error: signup ? 'Пароль має містити щонайменше 6 символів.' : 'Введи пароль.' });
      return null;
    }
    return { email, password };
  }
  async function signIn(email, password) {
    const input = credentials(email, password, false);
    if (!input) return { ok: false };
    return run(async () => {
      const { data, error } = await client.auth.signInWithPassword(input);
      if (error) throw error;
      generation++;
      const user = publicUser(data?.user || data?.session?.user);
      update({ user, status: !isOnline() ? 'offline' : user ? 'authenticated' : 'guest', verified: !!user && isOnline(),
        online: isOnline(), message: 'Вхід виконано.' });
      return { ok: true };
    });
  }
  async function signUp(email, password) {
    const input = credentials(email, password, true);
    if (!input) return { ok: false };
    return run(async () => {
      const { data, error } = await client.auth.signUp({ ...input,
        options: { emailRedirectTo: origin } });
      if (error) throw error;
      if (data?.session) {
        generation++;
        const user = publicUser(data.session.user);
        update({ user, status: isOnline() ? 'authenticated' : 'offline', verified: !!user && isOnline(),
          message: 'Акаунт створено. Вхід виконано.' });
      } else {
        // Confirmation-required signup is not an authenticated session.
        update({ message: 'Якщо реєстрація доступна для цієї адреси, надійде лист. Перевір пошту й підтвердь email, потім увійди.' });
      }
      return { ok: true, confirmationRequired: !data?.session };
    });
  }
  async function signInWithGoogle() {
    return run(async () => {
      if (!await beforeRedirect()) return { ok: false };
      const { error } = await client.auth.signInWithOAuth({ provider: 'google',
        options: { redirectTo: origin } });
      if (error) throw error;
      update({ message: 'Переходимо до Google…' });
      return { ok: true };
    });
  }
  async function signOut() {
    return run(async () => {
      // Local scope leaves other devices signed in and never clears study data.
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error && cachedUser(storage, storageKey)) throw error;
      generation++;
      update({ user: null, status: 'guest', verified: false,
        message: error ? 'Вихід на цьому пристрої виконано. Серверне відкликання сесії не підтверджено через відсутність мережі.' : 'Вихід виконано. Навчальні записи залишилися на пристрої.' });
      return { ok: true };
    }, { offline: true });
  }
  async function connectionChanged() {
    generation++;
    try {
      if (isOnline() && isVisible()) await client.auth.startAutoRefresh();
      else await client.auth.stopAutoRefresh();
    } catch { /* Connectivity status is still updated if a browser suspends timers. */ }
    if (!isOnline()) fromCache(); else if (isVisible()) await verifyUser();
  }
  const ready = verifyUser();
  return {
    getState: snapshot, ready, signIn, signUp, signInWithGoogle, signOut,
    verifyUser, connectionChanged,
    reportError(error) { update({ error: authErrorMessage(error, isOnline()) }); },
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); },
    dispose() { alive = false; generation++; if (queued !== null) cancel(queued); subscription.unsubscribe(); listeners.clear(); },
  };
}
