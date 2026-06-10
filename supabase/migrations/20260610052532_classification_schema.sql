-- TaskerLight S-02 — schemat klasyfikacji: sesje importu + typowane itemy.
-- Pełny model dwóch niezależnych wymiarów (akceptacja × operacyjny) od razu;
-- S-02 używa tylko `pending` (+ `new` dla zadań), S-03/S-04/S-06 budują na tym bez migracji.
-- Enumy po angielsku w bazie; polskie etykiety mapuje warstwa UI (labels.ts).
-- RLS ON + granularne polityki per-operacja na `user_id` (wzorzec z profiles.sql).
-- `(select auth.uid())` — wzorzec wydajnościowy RLS (cache initplan).

-- 1. Enumy domenowe ------------------------------------------------------------

-- Pięć typów itemu z klasyfikacji (FR-005). `other` jest świadomie ostatni
-- (mitygacja nadużywania — patrz prompt klasyfikacji).
create type item_type as enum ('task', 'note', 'idea', 'decision', 'other');

-- Wymiar akceptacji (US-02/US-03 w S-03). S-02 tworzy wyłącznie `pending`.
-- `deleted` = soft-delete (kosz, S-06); twardego DELETE wiersza nie używamy w MVP.
create type acceptance_status as enum ('pending', 'accepted', 'rejected', 'deleted');

-- Wymiar operacyjny (US-04 w S-04). Tylko dla `type = 'task'`; null dla pozostałych.
create type operational_status as enum ('new', 'in_progress', 'done', 'cancelled');

-- Cykl życia sesji importu. `processing` = w trakcie; trzy stany końcowe
-- odwzorowują cztery stany UI submitu (FR-006; stan 4 UI dzieli `failed`).
create type import_session_status as enum
  ('processing', 'completed_with_items', 'completed_no_items', 'failed');

-- 2. Tabela sesji importu (audit trail) ----------------------------------------

-- Osobny byt na każdy przebieg klasyfikacji (FR-015). Surowy wsad paste trzymany
-- w `raw_input`; referencja pliku (PR2) dojdzie osobnymi kolumnami w Fazie 6.
create table public.import_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status import_session_status not null default 'processing',
  raw_input text,
  item_count integer,
  error_message text,                  -- kod błędu bez szczegółów wrażliwych (FR-026)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Tabela itemów -------------------------------------------------------------

-- `import_session_id` jawnym elementem schematu (audit trail, FR-015), nullable
-- pod itemy ręczne z S-07 (NULL = legalny stan). `on delete set null`: usunięcie
-- sesji zrywa link, item zostaje. To NIE `restrict` — `restrict` jest nieodraczalny
-- i wywróciłby kaskadę `user_id` przy usunięciu konta (lessons.md; przegląd planu F1).
-- Kaskada `user_id → auth.users on delete cascade` usuwa wszystko przy usunięciu konta;
-- `set null` jako akcja (UPDATE) nie blokuje tej kaskady niezależnie od kolejności.
create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  import_session_id uuid references public.import_sessions (id) on delete set null,
  type item_type not null,
  title text not null,
  description text,
  acceptance_status acceptance_status not null default 'pending',
  operational_status operational_status,   -- tylko dla type='task'; null dla pozostałych
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Indeksy -------------------------------------------------------------------

-- Główny filtr widoku walidacyjnego: pendingi usera (Faza 5, getPendingItems).
create index items_user_acceptance_idx on public.items (user_id, acceptance_status);
-- Itemy danej sesji (audit trail; lookup po FK).
create index items_session_idx on public.items (import_session_id);
-- Sesje usera (przyszły dziennik importu, S-08).
create index import_sessions_user_idx on public.import_sessions (user_id);

-- 5. RLS — izolacja per-user ---------------------------------------------------

alter table public.import_sessions enable row level security;
alter table public.items enable row level security;

-- import_sessions: po cztery polityki per-operacja, tylko rola `authenticated`,
-- wyłącznie własne wiersze (wzorzec z profiles.sql).
create policy "import_sessions_select_own" on public.import_sessions
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "import_sessions_insert_own" on public.import_sessions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "import_sessions_update_own" on public.import_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "import_sessions_delete_own" on public.import_sessions
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- items: analogiczne cztery polityki per-operacja na `user_id`.
create policy "items_select_own" on public.items
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "items_insert_own" on public.items
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "items_update_own" on public.items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "items_delete_own" on public.items
  for delete to authenticated
  using ((select auth.uid()) = user_id);
