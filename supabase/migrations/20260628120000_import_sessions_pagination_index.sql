-- TaskerLight S-11 — indeks pod sortowanie po dacie i stabilne stronicowanie dziennika sesji importu.
-- Dotąd `import_sessions` miało wyłącznie indeks `(user_id)` (classification_schema.sql) — sort po
-- `created_at` wymagał osobnego kroku sortowania po skanie po userze, a paginacja offsetowa nie miała
-- wsparcia. Indeks złożony `(user_id, created_at, id)` pokrywa dokładnie kolejność zapytania listy:
-- filtr `user_id` → sort `created_at` → tie-break `id` (stabilizator, bo `created_at` nie jest unikalny).
-- Bez zmian danych ani RLS. Nakładać przyrostowo (`supabase migration up` lokalnie, `db push` na prod) —
-- NIGDY `db reset` (kasuje lokalną bazę).

create index import_sessions_user_created_id_idx
  on public.import_sessions (user_id, created_at, id);
