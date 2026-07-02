// Odczyt itemów nad klientem Supabase z RLS (cookies usera). Jedna funkcja `listItems(criteria)` składa
// w JEDNO zapytanie: predykat widoku (stan akceptacji/operacyjny), filtr typu, podfiltr operacyjny
// (tylko `active`), wyszukiwanie (`ilike` OR po title/description) i sortowanie z łańcuchem tie-break.
// Filtry dodatkowe FR-008 (S-09) działają po stronie serwera, sterowane parametrami URL przez `ListCriteria`.
// Od S-13 (Faza 1) odczyty zwracają `{ items, total }` i przyjmują OPCJONALNE okno strony — brak okna
// = pełna lista (dzisiejsze zachowanie; kompatybilność wstecz dla stron SSR i panelu S-10).

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ListCriteria, SortField } from "@/lib/services/list-criteria";
import type { Item } from "@/types";

const ITEM_COLUMNS =
  "id, user_id, import_session_id, type, title, description, acceptance_status, operational_status, created_at, updated_at";

/** Mapowanie pola sortowania kryteriów na kolumnę DB. */
const SORT_COLUMN: Record<SortField, string> = {
  created: "created_at",
  updated: "updated_at",
  title: "title",
};

/**
 * Buduje argument `.or()` wyszukiwania `title ILIKE %q% OR description ILIKE %q%`, neutralizując wejście
 * usera na DWÓCH warstwach:
 *  1. **SQL LIKE** — `%`, `_` (oraz `\`) escapowane backslashem, by user wpisujący `%`/`_` dostał
 *     dopasowanie LITERALNE, nie wildcard (PostgreSQL domyślny ESCAPE to `\`).
 *  2. **Składnia `.or()` PostgREST** — wartość owinięta w cudzysłowy, co neutralizuje delimitery `, . ( )`;
 *     wewnątrz cudzysłowów literalne `"` i `\` są escapowane backslashem (warstwa quotingu PostgREST).
 * Bez tego fraza `foo,bar` lub `f(x)` rozbiłaby parsowanie `.or()` (błąd / wstrzyknięcie warunku w obrębie
 * danych usera), a `50%` dawałoby błędne (wildcardowe) dopasowania.
 *
 * ZNANE OGRANICZENIE — `*` NIE jest literalizowany: PostgREST twardo mapuje `*`→`%` dla `ilike`, PO zdjęciu
 * cudzysłowów i BEZ escape'a (zweryfikowane empirycznie 2026-06-23 na lokalnym stacku: `%Zadanie\*A%` wciąż
 * dopasowuje „Zadanie A"). Dlatego `*` we frazie działa jak wildcard, inaczej niż literalne `%`/`_`. Pełna
 * literalność `*` wymagałaby operatora regex (również nieescapowalnego czysto przez quoting PostgREST) lub
 * RPC z bind-paramem + ESCAPE — świadomie poza zakresem (plan: supabase-js bez RPC, `target_scale: small`).
 */
export function buildSearchOrFilter(term: string): string {
  // Warstwa 1: literalizacja wildcardów LIKE (\ % _). Każdy znak mapowany niezależnie w jednym przebiegu.
  const likeEscaped = term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const pattern = `%${likeEscaped}%`;
  // Warstwa 2: quoting PostgREST — owiń w cudzysłowy, escapując wewnętrzne `"` i `\`.
  const quoted = `"${pattern.replace(/["\\]/g, (ch) => `\\${ch}`)}"`;
  return `title.ilike.${quoted},description.ilike.${quoted}`;
}

/** Okno strony (1-based). Wartości walidują parsery `parseItemPage`/`parseItemSize` — serwis im ufa. */
export interface ListWindow {
  page: number;
  size: number;
}

/** Jedna strona (lub pełna lista przy braku okna) + łączna liczba pasujących wierszy (do kontrolek stron). */
export interface ItemsPage {
  items: Item[];
  total: number;
}

/**
 * Lista itemów usera wg kryteriów — jedno zapytanie zastępujące pięć osobnych funkcji widoku. Predykat
 * widoku, filtr typu, podfiltr operacyjny (active), wyszukiwanie i sort składane warunkowo. Filtr `user_id`
 * redundantny względem RLS, ale jawny. Łańcuch sortowania kończy STAŁY tie-break (`created_at DESC` gdy
 * kolumna sortu ≠ created_at, potem zawsze `id ASC`) — `items.id` to losowy UUID (`gen_random_uuid`), więc
 * sam stabilizuje, ale układa losowo; `created_at DESC` daje chronologiczny porządek paczek bulk-akcji o
 * wspólnym `updated_at`, a `id` jest finalnym stabilizatorem. Odwzorowuje dotychczasową kolejność (F6).
 *
 * Opcjonalne `window` dokłada `.range(from, to)` (paginacja offsetowa, wzorzec `getImportSessions`);
 * brak okna = pełna lista. `count: "exact"` liczy WSZYSTKIE pasujące wiersze — świadomy kompromis MVP
 * jak w S-11 (koszt rośnie ze skalą; przy setkach wpisów pomijalny).
 */
export async function listItems(
  supabase: SupabaseClient,
  userId: string,
  criteria: ListCriteria,
  window?: ListWindow,
): Promise<ItemsPage> {
  let query = supabase.from("items").select(ITEM_COLUMNS, { count: "exact" }).eq("user_id", userId);

  // Predykat widoku (stan akceptacji + operacyjny).
  switch (criteria.view) {
    case "pending":
      query = query.eq("acceptance_status", "pending");
      break;
    case "active":
      query = query.eq("acceptance_status", "accepted").in("operational_status", ["new", "in_progress"]);
      break;
    case "done":
      query = query.eq("acceptance_status", "accepted").eq("operational_status", "done");
      break;
    case "cancelled":
      query = query.eq("acceptance_status", "accepted").eq("operational_status", "cancelled");
      break;
    case "trash":
      query = query.in("acceptance_status", ["rejected", "deleted"]);
      break;
  }

  // Filtr typu.
  if (criteria.type !== "all") query = query.eq("type", criteria.type);

  // Podfiltr operacyjny — tylko „Aktywne" (poza nim ignorowany; widok i tak zawęża stan).
  if (criteria.view === "active" && criteria.opstatus) {
    query = query.eq("operational_status", criteria.opstatus);
  }

  // Wyszukiwanie — pusta/whitespace fraza = brak filtra.
  const term = criteria.q.trim();
  if (term !== "") query = query.or(buildSearchOrFilter(term));

  // Sort + łańcuch tie-break.
  const column = SORT_COLUMN[criteria.sort];
  let ordered = query.order(column, { ascending: criteria.dir === "asc" });
  if (column !== "created_at") ordered = ordered.order("created_at", { ascending: false });
  ordered = ordered.order("id", { ascending: true });

  // Okno strony — tylko gdy podane (brak = pełna lista, dzisiejsze zachowanie).
  if (window) {
    const from = (window.page - 1) * window.size;
    ordered = ordered.range(from, from + window.size - 1);
  }

  const { data, error, count } = await ordered.overrideTypes<Item[], { merge: false }>();
  if (error) throw new Error("Odczyt itemów nie powiódł się.", { cause: error });
  return { items: data, total: count ?? 0 };
}

/**
 * Wszystkie elementy JEDNEJ sesji importu bieżącego usera (S-10, master-detail; od S-13 też tryb sesji) —
 * odpowiednik `listItems`, ale po `import_session_id` zamiast `view`. Sesja to SCOPE, nie widok: świadomie
 * BEZ filtra `acceptance_status`, więc konsument dostaje wszystkie cztery stany naraz (`pending`/`accepted`/
 * `rejected`/`deleted`). Filtr `user_id` redundantny względem RLS (`items_select_own`), ale jawny —
 * nieistniejąca lub cudza sesja zwróci po prostu pustą listę (RLS odfiltrowuje), bez osobnego sprawdzania
 * istnienia. Sort `created_at ASC` (niezmienny dla elementu, więc zmiana stanu NIGDY nie przesuwa wiersza)
 * + stały tie-break `id ASC`. Reużywa `ITEM_COLUMNS` (kształt `Item` 1:1 z `listItems`). Opcjonalne
 * `window` jak w `listItems` (brak = pełna lista — tolerancja; od F5 tryb sesji zawsze podaje okno).
 */
export async function getSessionItems(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  window?: ListWindow,
): Promise<ItemsPage> {
  let query = supabase
    .from("items")
    .select(ITEM_COLUMNS, { count: "exact" })
    .eq("user_id", userId)
    .eq("import_session_id", sessionId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (window) {
    const from = (window.page - 1) * window.size;
    query = query.range(from, from + window.size - 1);
  }
  const { data, error, count } = await query.overrideTypes<Item[], { merge: false }>();
  if (error) throw new Error("Odczyt elementów sesji nie powiódł się.", { cause: error });
  return { items: data, total: count ?? 0 };
}
