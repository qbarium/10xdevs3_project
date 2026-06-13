// Cykl życia sesji importu nad klientem Supabase z RLS (cookies usera, NIE service_role).
// Atomowy zapis itemów + finalizacja statusu idzie przez RPC persist_classification (jedna
// transakcja). Pustą klasyfikację finalizujemy bez RPC (completed_no_items). error_message
// przyjmuje wyłącznie krótki kod (bez szczegółów wrażliwych — FR-026).

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ClassifiedItem, ImportFile, ImportSession, ImportSessionStatus, ImportSessionWithFile } from "@/types";

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

// --- S-08: odczyt sesji (dziennik) + reopen pod ponowienie -------------------
// Wszystko nad klientem Supabase z RLS (cookies usera) — izolacja per-user jest egzekwowana
// politykami, dodatkowy `.eq("user_id", …)` to obrona w głąb i jawny kontrakt zapytania.

/** Opcje listowania sesji do dziennika: sortowanie po dacie i opcjonalny filtr statusu. */
export interface GetImportSessionsOptions {
  sort?: "created_desc" | "created_asc";
  status?: ImportSessionStatus;
}

/** Kształt wiersza z embedowanym `import_files` (LEFT JOIN) zwracany przez Supabase. */
interface ImportSessionRow extends ImportSession {
  import_files?: { file_name: string; file_mime: string | null }[] | null;
}

/**
 * Listuje sesje importu użytkownika do dziennika (S-08) z metadanymi pliku (LEFT JOIN
 * `import_files`). Sort po `created_at` (domyślnie malejąco) + opcjonalny filtr statusu.
 * MVP jest single-user o małym wolumenie — bez paginacji (indeks `import_sessions_user_idx`).
 */
export async function getImportSessions(
  supabase: SupabaseClient,
  userId: string,
  opts: GetImportSessionsOptions = {},
): Promise<ImportSessionWithFile[]> {
  const ascending = opts.sort === "created_asc";
  let query = supabase
    .from("import_sessions")
    .select(
      "id, user_id, status, raw_input, item_count, error_message, created_at, updated_at, import_files(file_name, file_mime)",
    )
    .eq("user_id", userId);
  if (opts.status) query = query.eq("status", opts.status);
  const { data, error } = await query.order("created_at", { ascending });
  if (error) throw new Error("Pobranie listy sesji importu nie powiodło się.", { cause: error });
  const rows = (data as unknown as ImportSessionRow[] | null) ?? [];
  return rows.map((row) => {
    const { import_files, ...session } = row;
    const file = Array.isArray(import_files) ? import_files[0] : null;
    return { ...session, file_name: file?.file_name ?? null, file_mime: file?.file_mime ?? null };
  });
}

/**
 * Pobiera pojedynczą sesję do ponowienia wraz z ewentualnym rekordem pliku (pełny `import_files`,
 * bo `file_path` jest potrzebny do downloadu w `loadSessionInput`). `null`, gdy sesja nie istnieje
 * lub nie należy do usera (RLS odfiltruje cudzy wiersz).
 */
export async function getSessionForRetry(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<(ImportSession & { file?: ImportFile }) | null> {
  const { data, error } = (await supabase
    .from("import_sessions")
    .select("*, import_files(*)")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .maybeSingle()) as {
    data: (ImportSession & { import_files?: ImportFile[] | null }) | null;
    error: unknown;
  };
  if (error) throw new Error("Pobranie sesji do ponowienia nie powiodło się.", { cause: error });
  if (!data) return null;
  const { import_files, ...session } = data;
  const file = Array.isArray(import_files) ? import_files[0] : undefined;
  return { ...session, file };
}

/**
 * Warunkowo otwiera sesję ponownie pod reuse wiersza: `failed → processing`, czyszcząc ślad
 * poprzedniej porażki (`error_message`/`item_count`). `WHERE status='failed'` czyni operację
 * atomowym guardem TOCTOU przeciw podwójnemu ponowieniu — zwraca `true` tylko gdy TEN wywołujący
 * przestawił wiersz; `false`, gdy równoległe ponowienie zdążyło już go ruszyć (0 zmienionych wierszy).
 */
export async function reopenSession(supabase: SupabaseClient, sessionId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("import_sessions")
    .update({ status: "processing", error_message: null, item_count: null, updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("status", "failed")
    .select("id");
  if (error) throw new Error("Ponowne otwarcie sesji nie powiodło się.", { cause: error });
  return Array.isArray(data) && data.length > 0;
}
