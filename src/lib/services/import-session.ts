// Cykl życia sesji importu nad klientem Supabase z RLS (cookies usera, NIE service_role).
// Atomowy zapis itemów + finalizacja statusu idzie przez RPC persist_classification (jedna
// transakcja). Pustą klasyfikację finalizujemy bez RPC (completed_no_items). error_message
// przyjmuje wyłącznie krótki kod (bez szczegółów wrażliwych — FR-026).

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SessionRowData } from "@/components/import-sessions/SessionCard";
import { SESSION_PAGE_SIZE } from "@/lib/services/session-list-criteria";
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

/** Opcje listowania sesji do dziennika: sort po dacie, opcjonalny filtr statusu, paginacja offsetowa. */
export interface GetImportSessionsOptions {
  sort?: "created_desc" | "created_asc";
  status?: ImportSessionStatus;
  /** Numer strony (1-based). Domyślnie 1; clamp do ≥ 1. */
  page?: number;
  /** Rozmiar strony. Domyślnie `SESSION_PAGE_SIZE`. */
  pageSize?: number;
}

/** Jedna strona dziennika: wiersze + łączna liczba (do kontrolek stron) + echo strony/rozmiaru. */
export interface ImportSessionsPage {
  sessions: ImportSessionWithFile[];
  total: number;
  page: number;
  pageSize: number;
}

/** Kształt wiersza z embedowanym `import_files` (LEFT JOIN) + agregatem `items(count)` zwracany przez Supabase. */
interface ImportSessionRow extends ImportSession {
  import_files?: { file_name: string; file_mime: string | null }[] | null;
  items?: { count: number }[] | null;
}

/** Kolumny + embedy wiersza dziennika — wspólny kształt `select` listy (`getImportSessions`) i `getSessionMeta`. */
const SESSION_ROW_SELECT =
  "id, user_id, status, raw_input, item_count, error_message, created_at, updated_at, import_files(file_name, file_mime), items(count)";

/** Spłaszcza surowy wiersz z embedami do `ImportSessionWithFile` (pola pomocnicze embedów nie wyciekają). */
function flattenSessionRow(row: ImportSessionRow): ImportSessionWithFile {
  const { import_files, items, ...session } = row;
  const file = Array.isArray(import_files) ? import_files[0] : null;
  // `items(count)` zwraca [{ count: N }] (RLS-scoped → liczba ŻYWYCH elementów sesji usera).
  const live_item_count = Array.isArray(items) ? (items[0]?.count ?? 0) : 0;
  return {
    ...session,
    file_name: file?.file_name ?? null,
    file_mime: file?.file_mime ?? null,
    live_item_count,
  };
}

/**
 * Listuje JEDNĄ STRONĘ sesji importu użytkownika do dziennika (S-08 + paginacja S-11) z metadanymi pliku
 * (LEFT JOIN `import_files`). Sort po `created_at` (domyślnie malejąco) ze STABILIZATOREM `id` (tie-break)
 * + opcjonalny filtr statusu + `range(from, to)` dla strony + `count: "exact"` dla łącznej liczby.
 *
 * Tie-break po `id` jest konieczny: `created_at` nie jest unikalny (seria ponowień w jednej chwili), więc
 * bez stabilizatora wiersze na granicy strony mogłyby się powtarzać lub gubić przy offsecie (indeks
 * `import_sessions (user_id, created_at, id)` wspiera dokładnie tę kolejność).
 */
export async function getImportSessions(
  supabase: SupabaseClient,
  userId: string,
  opts: GetImportSessionsOptions = {},
): Promise<ImportSessionsPage> {
  const ascending = opts.sort === "created_asc";
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const pageSize = opts.pageSize ?? SESSION_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  // Uwaga skali (świadomy kompromis MVP): `count: "exact"` liczy WSZYSTKIE pasujące wiersze (nie estymuje),
  // a `.range` to paginacja offsetowa — koszt rośnie z liczbą sesji i głębokością strony. Dla solo-MVP
  // (dziesiątki/setki sesji) nieistotne; przy dziesiątkach tysięcy → keyset/cursor lub `count: "estimated"`.
  let query = supabase.from("import_sessions").select(SESSION_ROW_SELECT, { count: "exact" }).eq("user_id", userId);
  if (opts.status) query = query.eq("status", opts.status);
  const { data, error, count } = await query
    .order("created_at", { ascending })
    .order("id", { ascending })
    .range(from, to);
  if (error) throw new Error("Pobranie listy sesji importu nie powiodło się.", { cause: error });
  const rows = (data as unknown as ImportSessionRow[] | null) ?? [];
  return { sessions: rows.map(flattenSessionRow), total: count ?? 0, page, pageSize };
}

// --- S-11: mapowanie wiersza do odchudzonego DTO wyspy (współdzielone: strona + endpoint) ----------------
// Jedno źródło prawdy mapowania `ImportSessionWithFile → SessionRowData` (gotowy podgląd ≤120 zn., etykieta
// daty, status/itemCount/live). Wcześniej liczone wyłącznie w `import-sessions.astro`; po przejściu na fetch
// kliencki (S-11) ten sam mapper karmi render SSR (stan początkowy) i endpoint (kolejne strony) — strona
// i endpoint produkują IDENTYCZNE wiersze. Czysty (bez Supabase), więc bezpieczny też do testów w node.

const PREVIEW_MAX = 120;

/** Gotowy podgląd wiersza: nazwa pliku, albo skrócony (≤120 zn.) `raw_input`, albo „(pusty wsad)". */
function rowPreview(session: ImportSessionWithFile): string {
  if (session.file_name) return session.file_name;
  const collapsed = (session.raw_input ?? "").replace(/\s+/g, " ").trim();
  if (!collapsed) return "(pusty wsad)";
  return collapsed.length > PREVIEW_MAX ? `${collapsed.slice(0, PREVIEW_MAX)}…` : collapsed;
}

/** Czysta funkcja: wiersz serwisu → odchudzone DTO wyspy. Bez pełnego `raw_input` w payloadzie klienta. */
export function toSessionRow(session: ImportSessionWithFile): SessionRowData {
  return {
    id: session.id,
    isFile: Boolean(session.file_name),
    preview: rowPreview(session),
    dateLabel: session.created_at.slice(0, 16).replace("T", " "),
    status: session.status,
    itemCount: session.item_count,
    liveItemCount: session.live_item_count,
    errorCode: session.error_message,
  };
}

/**
 * Metadane JEDNEJ sesji dla banera trybu sesji (S-13 F4): ten sam kształt `select` co lista dziennika
 * (`SESSION_ROW_SELECT` z embedami `import_files` + `items(count)`), mapowany współdzielonym
 * `toSessionRow` — baner i wiersz dziennika pokazują IDENTYCZNE dane. Nieistniejąca lub cudza sesja →
 * `null` (RLS odfiltrowuje wiersz). Format UUID rozstrzyga wywołujący (strona/endpoint) PRZED wywołaniem.
 */
export async function getSessionMeta(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<SessionRowData | null> {
  const { data, error } = await supabase
    .from("import_sessions")
    .select(SESSION_ROW_SELECT)
    .eq("user_id", userId)
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error("Pobranie sesji importu nie powiodło się.", { cause: error });
  if (!data) return null;
  return toSessionRow(flattenSessionRow(data));
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
