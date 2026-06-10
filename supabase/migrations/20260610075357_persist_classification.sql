-- TaskerLight S-02 — atomowy zapis klasyfikacji (guardrail audit trail).
-- Wstawia itemy powiązane z sesją i finalizuje status sesji w JEDNEJ transakcji
-- (funkcja = niejawna transakcja). SECURITY INVOKER → RLS egzekwowane w kontekście usera:
-- itemy dostają user_id z sesji (= auth.uid() wołającego), więc with_check polityk przechodzi.
-- Pustą tablicę obsługuje serwis (status completed_no_items, bez wołania RPC).

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
  -- operational 'new' tylko dla 'task' (inaczej null). user_id z sesji (audit trail + RLS).
  insert into public.items (user_id, import_session_id, type, title, description, acceptance_status, operational_status)
  select
    s.user_id,
    p_session_id,
    (elem ->> 'type')::item_type,
    elem ->> 'title',
    elem ->> 'description',
    'pending'::acceptance_status,
    case when (elem ->> 'type') = 'task' then 'new'::operational_status else null end
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
