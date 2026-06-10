// Odczyt itemów nad klientem Supabase z RLS (cookies usera). S-02 zna jeden widok: pendingi
// (filtr główny „Elementy do akceptacji", FR-008). Akcje accept/reject/edit → S-03.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Item } from "@/types";

/** Pendingi usera, najnowsze pierwsze. Filtr `user_id` redundantny względem RLS, ale jawny. */
export async function getPendingItems(supabase: SupabaseClient, userId: string): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items")
    .select(
      "id, user_id, import_session_id, type, title, description, acceptance_status, operational_status, created_at, updated_at",
    )
    .eq("user_id", userId)
    .eq("acceptance_status", "pending")
    .order("created_at", { ascending: false })
    .overrideTypes<Item[], { merge: false }>();
  if (error) throw new Error("Odczyt itemów nie powiódł się.", { cause: error });
  return data;
}
