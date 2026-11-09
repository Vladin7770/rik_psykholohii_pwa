import { authStorageKey } from './auth-controller.mjs';

export function createBrowserClient({ createClient, config, storage, online, fetch }) {
  // SDK INITIAL_SESSION subscribers may refresh expired tokens. Defer the entire
  // client on a cold offline start instead of blocking on a refresh retry loop.
  if (!online) return null;
  return createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: {
      storage, storageKey: authStorageKey(config.SUPABASE_URL), persistSession: true,
      autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce',
    },
    global: { fetch },
  });
}
