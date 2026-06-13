// Odczyt itemów nad klientem Supabase z RLS (cookies usera). Filtry główne listy (FR-008):
// pendingi („Elementy do akceptacji", S-02) oraz zaakceptowane/odrzucone (Aktywne/Kosz, S-03).
// Trzy widoki są symetryczne — różni je wyłącznie `acceptance_status`, więc dzielą jeden trzon.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AcceptanceStatus, Item } from "@/types";

const ITEM_COLUMNS =
  "id, user_id, import_session_id, type, title, description, acceptance_status, operational_status, created_at, updated_at";

/**
 * Itemy usera o danym statusie akceptacji, najnowsze pierwsze. Filtr `user_id` redundantny względem
 * RLS, ale jawny. Wspólny trzon dla trzech filtrów głównych (pending / accepted / rejected).
 */
async function listByAcceptance(supabase: SupabaseClient, userId: string, status: AcceptanceStatus): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items")
    .select(ITEM_COLUMNS)
    .eq("user_id", userId)
    .eq("acceptance_status", status)
    .order("created_at", { ascending: false })
    .overrideTypes<Item[], { merge: false }>();
  if (error) throw new Error("Odczyt itemów nie powiódł się.", { cause: error });
  return data;
}

/** Pendingi usera („Elementy do akceptacji", FR-008). */
export function getPendingItems(supabase: SupabaseClient, userId: string): Promise<Item[]> {
  return listByAcceptance(supabase, userId, "pending");
}

/** Zaakceptowane itemy usera (widok „Aktywne", S-03). */
export function getAcceptedItems(supabase: SupabaseClient, userId: string): Promise<Item[]> {
  return listByAcceptance(supabase, userId, "accepted");
}

/** Odrzucone itemy usera (widok „Kosz", S-03; read-only — przenieś/przywróć/wyczyść → S-06). */
export function getRejectedItems(supabase: SupabaseClient, userId: string): Promise<Item[]> {
  return listByAcceptance(supabase, userId, "rejected");
}
