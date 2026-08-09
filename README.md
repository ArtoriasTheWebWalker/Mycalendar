# My Calendar

A quiet, dark-by-default year calendar. One month at a time, a left rail to scroll
between months, events sit on their day. Two things write to it: **me, on any
device**, and **Claude, pushing events from chat**.

Static, no build step — `index.html` + `style.css` + `calendar.js` (render) +
`store.js` (data layer, single source of truth). See the decision record in the
Obsidian vault: `Year Calendar/Decisions & Approach.md`.

## Run it locally (demo mode — no setup)

With no `config.js`, it runs in **Local (demo)** mode backed by `localStorage`:

```bash
npx serve .
```

Open the printed URL. Add/edit/delete events, switch months, toggle theme. Data
stays in that one browser.

## Wire up real cross-device sync (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query →** paste `schema.sql` → **Run**. Creates the `events`
   table, RLS policy, and realtime.
3. **Authentication → Providers →** ensure **Email** is enabled (magic link is on
   by default). Add your site URL under **URL Configuration → Redirect URLs**
   (e.g. your GitHub Pages URL, and `http://localhost:3000` for local testing).
4. **Project Settings → API →** copy the **Project URL** and the **anon public**
   key.
5. `cp config.example.js config.js` and paste those two values in. `config.js` is
   gitignored — never commit it.
6. Reload. The badge reads **Synced**; you'll be asked to sign in with a magic
   link. Same email on every device = same calendar.

## How Claude pushes events

Claude writes with the **service_role** key (server-side, never in this repo),
which bypasses RLS. In chat, just say e.g. *"add SE401 final on Aug 20"* and it
inserts a row with `added_by = 'claude'`; realtime makes it appear on your
devices. (One-time: you give Claude the project URL + service_role key in the
chat where you want it to push — not stored here.)

## Deploy

Push to a GitHub repo, enable **Pages**. Because `config.js` is gitignored, add
your two public values via a committed `config.js` on the Pages branch *or* keep
them in a small deploy step — never the service_role key.
