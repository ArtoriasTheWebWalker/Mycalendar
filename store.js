/* store.js — the single source of truth for events.
 *
 * Two modes, chosen automatically from config.js:
 *   • SUPABASE mode — CONFIG.SUPABASE_URL + CONFIG.SUPABASE_ANON_KEY present.
 *     Reads/writes the `events` table; magic-link auth gates access via RLS.
 *   • LOCAL (demo) mode — no config. Persists to localStorage so the UI is
 *     fully usable before Supabase is wired up. Mirrors the FPL local-vs-live
 *     config split. No auth in local mode — it never leaves the browser.
 *
 * Every mutation ends by emitting 'change' so the UI re-renders from one place.
 */
const Store = (() => {
  const CFG = window.CONFIG || {};
  const MODE = (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) ? 'supabase' : 'local';
  const LS_KEY = 'mycalendar.events';
  const listeners = new Set();
  let sb = null;            // Supabase client (supabase mode)
  let cache = [];           // in-memory list of events, always current

  function emit() { listeners.forEach(fn => fn(cache)); }

  const uuid = () =>
    (crypto.randomUUID ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        }));

  /* ---- Local (demo) backend ---------------------------------------- */
  const local = {
    load() {
      try { cache = JSON.parse(localStorage.getItem(LS_KEY)) || []; }
      catch { cache = []; }
    },
    persist() { localStorage.setItem(LS_KEY, JSON.stringify(cache)); },
    add(ev) {
      const row = { id: uuid(), added_by: 'me', created_at: new Date().toISOString(), ...ev };
      cache.push(row); this.persist(); emit(); return row;
    },
    update(id, patch) {
      cache = cache.map(e => e.id === id ? { ...e, ...patch } : e);
      this.persist(); emit();
    },
    remove(id) { cache = cache.filter(e => e.id !== id); this.persist(); emit(); },
  };

  /* ---- Supabase backend -------------------------------------------- */
  const remote = {
    async refresh() {
      const { data, error } = await sb.from('events').select('*').order('event_date');
      if (error) { console.error('[store] load failed', error); return; }
      cache = data || []; emit();
    },
    async add(ev) {
      const { data, error } = await sb.from('events').insert(ev).select().single();
      if (error) { console.error('[store] add failed', error); throw error; }
      cache.push(data); emit(); return data;
    },
    async update(id, patch) {
      const body = { ...patch, updated_at: new Date().toISOString() };
      const { error } = await sb.from('events').update(body).eq('id', id);
      if (error) { console.error('[store] update failed', error); throw error; }
      cache = cache.map(e => e.id === id ? { ...e, ...body } : e); emit();
    },
    async remove(id) {
      const { error } = await sb.from('events').delete().eq('id', id);
      if (error) { console.error('[store] delete failed', error); throw error; }
      cache = cache.filter(e => e.id !== id); emit();
    },
  };

  const backend = MODE === 'supabase' ? remote : local;

  /* ---- Public API --------------------------------------------------- */
  return {
    mode: MODE,

    /* Boots the store. In supabase mode, requires an authed session first
     * (calendar.js drives the login overlay via Store.auth). Returns when the
     * initial data is loaded into cache. */
    async init() {
      if (MODE === 'local') { local.load(); emit(); return; }
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
      await remote.refresh();
      // Realtime: pick up events pushed by Claude (or another device) live.
      sb.channel('events-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' },
            () => remote.refresh())
        .subscribe();
    },

    /* Auth helpers — no-ops in local mode. */
    auth: {
      enabled: MODE === 'supabase',
      async session() {
        if (MODE !== 'supabase') return { user: { local: true } };
        if (!sb) sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
        const { data } = await sb.auth.getSession();
        return data.session;
      },
      // Email + password — no emails, no redirect. The most reliable flow inside
      // an installed PWA (needs "Confirm email" off in Supabase so sign-up gives a
      // session immediately).
      async signIn(email, password) {
        if (!sb) sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
        return sb.auth.signInWithPassword({ email, password });
      },
      async signUp(email, password) {
        if (!sb) sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
        return sb.auth.signUp({ email, password });
      },
      async signOut() { if (sb) await sb.auth.signOut(); },
      onChange(cb) { if (sb) sb.auth.onAuthStateChange((_e, s) => cb(s)); },
    },

    /* Reads (synchronous, from cache) */
    all() { return cache; },
    forMonth(year, month /* 0-based */) {
      return cache.filter(e => {
        const [y, m] = e.event_date.split('-').map(Number);
        return y === year && (m - 1) === month;
      });
    },
    forDay(dateStr) { return cache.filter(e => e.event_date === dateStr); },
    countByMonth(year) {
      const counts = Array(12).fill(0);
      cache.forEach(e => {
        const [y, m] = e.event_date.split('-').map(Number);
        if (y === year) counts[m - 1]++;
      });
      return counts;
    },

    /* Writes (async; both backends resolve after cache + emit) */
    add(ev)          { return backend.add(ev); },
    update(id, patch){ return backend.update(id, patch); },
    remove(id)       { return backend.remove(id); },

    /* Subscribe to cache changes — the one place the UI re-renders from. */
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
