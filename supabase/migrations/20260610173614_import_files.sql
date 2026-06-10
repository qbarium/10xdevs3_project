-- TaskerLight S-02 Faza 6 (PR2) — pliki wsadu jako OSOBNA tabela (sesja → wiele plików, model docelowy).
-- "Jeden plik na submit" w MVP = wyłącznie uproszczenie UI/logiki uploadu — NIE jest utrwalone w
-- schemacie ani w ścieżce. Nazwą obiektu w Storage jest `id` (UUID) tej tabeli (= file_id w ścieżce),
-- NIE nazwa od usera (kolizje + bezpieczeństwo); oryginalna nazwa usera w `file_name` do prezentacji.

create table public.import_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.import_sessions (id) on delete cascade,
  file_path text not null,   -- pełny klucz obiektu w buckecie: <user_id>/<session_id>/<id>.<ext>
  file_name text not null,   -- oryginalna nazwa pliku od usera (prezentacja / dziennik S-08)
  file_mime text,            -- zadeklarowany MIME (diagnostyka; walidacja typu w serwisie Faza 7)
  created_at timestamptz not null default now()
);

-- Oba FK ON DELETE CASCADE. Usunięcie konta kasuje pliki bezpośrednio (user_id) i pośrednio
-- (session_id → import_sessions). Zbieżne ścieżki kaskady do tego samego wiersza są w PostgreSQL
-- dozwolone — to NIE `restrict`, więc brak kolizji z lessons.md. Usunięcie samej sesji kaskaduje jej pliki.

create index import_files_session_idx on public.import_files (session_id);
create index import_files_user_idx on public.import_files (user_id);

alter table public.import_files enable row level security;

-- RLS: izolacja po user_id (wzorzec items/import_sessions). Cztery polityki per-operacja, rola
-- authenticated. `(select auth.uid())` — wzorzec wydajnościowy (cache initplan).
-- Uwaga: te same NAZWY polityk istnieją na storage.objects (Migracja 1) — to inna tabela,
-- nazwy polityk są per-tabela, więc brak kolizji.
create policy "import_files_select_own" on public.import_files
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "import_files_insert_own" on public.import_files
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "import_files_update_own" on public.import_files
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "import_files_delete_own" on public.import_files
  for delete to authenticated
  using ((select auth.uid()) = user_id);
