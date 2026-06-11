-- TaskerLight S-02 Faza 6 (PR2) — Storage: prywatny bucket na pliki wsadu + RLS per-user.
-- Konwencja ścieżki obiektu: <user_id>/<session_id>/<file_id>.<ext> (file_id = import_files.id, UUID)
-- → izolacja po PIERWSZYM segmencie ścieżki (user_id); storage.objects nie ma kolumny user_id,
-- "właścicielem" jest prefiks folderu. Nazwą obiektu jest file_id, nie nazwa od usera.
-- RLS na storage.objects jest WŁĄCZONY domyślnie przez Supabase, a tabela należy do
-- supabase_storage_admin — NIE przełączamy tu RLS (zrobiłoby to błąd własności); dodajemy
-- wyłącznie polityki. `(select auth.uid())` — wzorzec wydajnościowy RLS (cache initplan),
-- spójny z migracjami profiles/classification.

-- 1. Prywatny bucket -----------------------------------------------------------
-- public = false → brak publicznych URL-i; dostęp wyłącznie przez API z sesją usera.
-- on conflict do nothing → idempotentne przy ponownym nałożeniu (kolejne środowiska / reset).
insert into storage.buckets (id, name, public)
values ('import-files', 'import-files', false)
on conflict (id) do nothing;

-- 2. RLS na storage.objects — tylko obiekty w prefiksie własnego user_id w buckecie import-files.
-- (storage.foldername(name))[1] = pierwszy segment ścieżki = <user_id> (konwencja Faza 7 upload).

create policy "import_files_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'import-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "import_files_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'import-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "import_files_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'import-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'import-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "import_files_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'import-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
