-- TaskerLight S-04 — stan operacyjny dla WSZYSTKICH typów itemów (świadomy wyłom z FR-009).
-- Trzy zmiany w jednym pliku migracji (sekwencjonowanie krytyczne — patrz plan.md §Krytyczne
-- szczegóły): rozjazd backfillu, RPC i derywacji w kodzie = nowe itemy nie-`task` wpadają z NULL
-- i wypadają poza filtr Aktywne/Zakończone (znikają z list).
--   1. backfill: istniejące itemy nie-`task` mają operational_status NULL → 'new'
--      (po S-02/S-03 'new' dostawał wyłącznie `task`); idempotentny (where ... is null).
--   2. indeks 3-kolumnowy (user_id, acceptance_status, operational_status) pod filtr główny
--      (Aktywne/Zakończone/Anulowane). Stary 2-kolumnowy to jego dokładny lewy prefiks →
--      redundantny (B-tree obsłuży `listByAcceptance` nowym indeksem), więc go usuwamy.
--   3. RPC persist_classification: nowe itemy KAŻDEGO typu dostają 'new' (było: tylko `task`).
-- Kolumna zostaje nullable — aplikacja + RPC zawsze ustawiają 'new', więc nowych NULL nie będzie
-- (twardy NOT NULL = opcjonalne utwardzenie później, patrz plan.md §Czego NIE robimy).

-- 1. Backfill istniejących itemów nie-`task` (jednorazowy, idempotentny).
update public.items
set operational_status = 'new'
where operational_status is null;

-- 2. Indeks filtra głównego: (user_id, acceptance_status, operational_status).
-- Pokrywa getActiveItems/getDoneItems/getCancelledItems (S-04) ORAZ listByAcceptance (S-03) —
-- para (user_id, acceptance_status) jest lewym prefiksem tego indeksu.
create index items_user_acceptance_operational_idx
  on public.items (user_id, acceptance_status, operational_status);

-- Stary 2-kolumnowy indeks jest dokładnym lewym prefiksem nowego → redundantny.
drop index if exists items_user_acceptance_idx;

-- 3. RPC persist_classification — 'new' dla KAŻDEGO typu (S-04, wyłom z FR-009).
-- Reszta kontraktu (atomowy zapis itemów + finalizacja sesji w jednej transakcji,
-- SECURITY INVOKER → RLS w kontekście usera) bez zmian względem 20260610075357.
create or replace function public.persist_classification(p_session_id uuid, p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  -- Wstaw itemy: type/title/description z payloadu, acceptance 'pending',
  -- operational 'new' dla KAŻDEGO typu (S-04: stan operacyjny obejmuje wszystkie typy).
  insert into public.items (user_id, import_session_id, type, title, description, acceptance_status, operational_status)
  select
    s.user_id,
    p_session_id,
    (elem ->> 'type')::item_type,
    elem ->> 'title',
    elem ->> 'description',
    'pending'::acceptance_status,
    'new'::operational_status
  from public.import_sessions s
  cross join jsonb_array_elements(p_items) as elem
  where s.id = p_session_id;

  get diagnostics v_count = row_count;

  -- Finalizuj sesję w tej samej transakcji — częściowy zapis (itemy bez statusu) niemożliwy.
  update public.import_sessions
  set status = 'completed_with_items', item_count = v_count, updated_at = now()
  where id = p_session_id;

  return v_count;
end;
$$;

-- Rola authenticated wywołuje funkcję przez PostgREST RPC.
grant execute on function public.persist_classification(uuid, jsonb) to authenticated;
