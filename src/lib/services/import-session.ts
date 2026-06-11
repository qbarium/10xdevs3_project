// Cykl życia sesji importu nad klientem Supabase z RLS (cookies usera, NIE service_role).
// Atomowy zapis itemów + finalizacja statusu idzie przez RPC persist_classification (jedna
// transakcja). Pustą klasyfikację finalizujemy bez RPC (completed_no_items). error_message
// przyjmuje wyłącznie krótki kod (bez szczegółów wrażliwych — FR-026).

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ClassifiedItem } from "@/types";

/**
 * Tworzy sesję w stanie `processing`. Id generujemy po stronie klienta (deterministycznie, bez
 * odczytu zwrotnego). `rawInput` = treść paste; dla wsadu plikowego null (treść żyje w storage +
 * `import_files`, kolumna `raw_input` jest nullable).
 */
export async function createSession(
  supabase: SupabaseClient,
  userId: string,
  rawInput: string | null,
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const { error } = await supabase
    .from("import_sessions")
    .insert({ id, user_id: userId, status: "processing", raw_input: rawInput });
  if (error) throw new Error("Utworzenie sesji importu nie powiodło się.", { cause: error });
  return { id };
}

/** Atomowo zapisuje itemy i finalizuje sesję (RPC). Zwraca liczbę zapisanych itemów. */
export async function persistItems(
  supabase: SupabaseClient,
  sessionId: string,
  items: ClassifiedItem[],
): Promise<number> {
  const result = await supabase.rpc("persist_classification", {
    p_session_id: sessionId,
    p_items: items,
  });
  if (result.error) throw new Error("Atomowy zapis itemów nie powiódł się.", { cause: result.error });
  // result.data (any bez gen-types) zawężone typeof — RPC zwraca integer (liczbę zapisanych itemów).
  return typeof result.data === "number" ? result.data : items.length;
}

/** Finalizuje sesję bez itemów (poprawny wynik 0 itemów, FR-005). */
export async function finalizeEmpty(supabase: SupabaseClient, sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("import_sessions")
    .update({ status: "completed_no_items", item_count: 0, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw new Error("Finalizacja sesji bez itemów nie powiodła się.", { cause: error });
}

/** Oznacza sesję jako `failed` z krótkim kodem przyczyny (bez szczegółów wrażliwych). */
export async function failSession(supabase: SupabaseClient, sessionId: string, code: string): Promise<void> {
  const { error } = await supabase
    .from("import_sessions")
    .update({ status: "failed", error_message: code, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw new Error("Oznaczenie sesji jako failed nie powiodło się.", { cause: error });
}
