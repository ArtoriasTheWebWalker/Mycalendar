-- My Calendar — Supabase schema + security.
-- Run this once in the Supabase dashboard → SQL Editor → New query → Run.

-- 1. The events table (matches the locked v1 schema; extend later with ADD COLUMN)
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  event_date  date        not null,
  title       text        not null,
  category    text,                          -- optional free-text tag
  notes       text,
  added_by    text        not null default 'me',   -- 'me' | 'claude'
  color       text,                                -- optional per-event colour (hex)
  done        boolean     not null default false,   -- checkbox: done / not done
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- If the table already exists from an earlier run, add newer columns:
alter table public.events add column if not exists color text;
alter table public.events add column if not exists done boolean not null default false;

create index if not exists events_date_idx on public.events (event_date);

-- 2. Row-Level Security: only a signed-in user (magic link) can touch rows.
--    The anon key in the browser can do NOTHING until authenticated.
--    The service_role key (used by Claude, server-side) bypasses RLS entirely.
alter table public.events enable row level security;

drop policy if exists "authenticated full access" on public.events;
create policy "authenticated full access"
  on public.events
  for all
  to authenticated
  using (true)
  with check (true);

-- Table-level GRANT (separate from RLS). Without this the authenticated role
-- can hit "42501 permission denied" even with a policy. anon gets nothing.
grant select, insert, update, delete on public.events to authenticated;

-- Realtime so pushes from Claude/other devices appear live:
alter publication supabase_realtime add table public.events;
