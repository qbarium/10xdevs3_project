-- TaskerLight — pierwsza domenowa tabela: profile użytkownika (nośnik klucza BYOK).
-- 1:1 z auth.users; kolumny klucza nullowalne (null = klucz nieskonfigurowany).
-- RLS ON + granularne polityki per-operacja, każda zwiazana z auth.uid() = id
-- (CLAUDE.md Hard rules). `(select auth.uid())` — wzorzec wydajnosciowy RLS (cache initplan).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  api_key_encrypted text,
  api_key_hint text,
  api_key_updated_at timestamptz
);

alter table public.profiles enable row level security;

-- Per-operacja, tylko rola `authenticated`, wylacznie wlasny wiersz.
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Sciezka "usun klucz" w S-01 to UPDATE (zerowanie kolumn), nie DELETE wiersza;
-- polityka delete istnieje dla kompletnosci per-operacja, nieuzywana w tym wycinku.
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated
  using ((select auth.uid()) = id);
