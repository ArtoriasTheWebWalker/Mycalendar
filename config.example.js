/* config.example.js — copy this to `config.js` and fill in your values.
 *
 *   cp config.example.js config.js   (then edit config.js)
 *
 * config.js is gitignored and must NEVER be committed. These are the *public*
 * anon key + project URL (safe in the browser, fenced by RLS). The powerful
 * service_role key is NOT here — it lives only where Claude runs.
 *
 * Leave config.js absent to run in LOCAL (demo) mode with localStorage. */
window.CONFIG = {
  SUPABASE_URL:      'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-PUBLIC-ANON-KEY',
};
