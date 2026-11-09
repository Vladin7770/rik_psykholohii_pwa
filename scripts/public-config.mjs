// These two values are deliberately public in a browser application.
// Never serialize process.env wholesale: it can contain server credentials.
export function publicConfig(env) {
  const url = (env.SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_ANON_KEY || '').trim();
  if (!url && !key) return { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' };
  if (!url || !key) throw new Error('Set both SUPABASE_URL and SUPABASE_ANON_KEY.');
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('SUPABASE_URL must be a valid URL.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) ||
      parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('SUPABASE_URL must be an HTTPS origin (HTTP is allowed for localhost).');
  }
  let anonymous = false;
  if (key.startsWith('sb_publishable_') && key.length > 'sb_publishable_'.length) anonymous = true;
  else {
    try {
      const parts = key.split('.');
      anonymous = parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url')).role === 'anon';
    } catch { /* A malformed or privileged key is rejected below. */ }
  }
  if (!anonymous) throw new Error('SUPABASE_ANON_KEY must be a public publishable/anon key, never a secret/service_role key.');
  return { SUPABASE_URL: parsed.origin, SUPABASE_ANON_KEY: key };
}

export function configScript(config) {
  const json = JSON.stringify(config).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return '// Generated at build time. Contains public configuration only.\nwindow.RIK_CONFIG = Object.freeze(' + json + ');\n';
}
