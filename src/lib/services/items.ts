// Odczyt itemów nad klientem Supabase z RLS (cookies usera). Jedna funkcja `listItems(criteria)` składa
// w JEDNO zapytanie: predykat widoku (stan akceptacji/operacyjny), filtr typu, podfiltr operacyjny
// (tylko `active`), wyszukiwanie (`ilike` OR po title/description) i sortowanie z łańcuchem tie-break.
// Filtry dodatkowe FR-008 (S-09) działają po stronie serwera, sterowane parametrami URL przez `ListCriteria`.
// Stare `getXItems` zostają jako CIENKIE NAKŁADKI (domyślne kryteria widoku) — strony `.astro` migrują do
// `listItems` dopiero w Fazie 4, więc do tego czasu działają bez zmian.

import type { SupabaseClient } from "@supabase/supabase-js";

import { defaultCriteria } from "@/lib/services/list-criteria";
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

/**
 * Lista itemów usera wg kryteriów — jedno zapytanie zastępujące pięć osobnych funkcji widoku. Predykat
 * widoku, filtr typu, podfiltr operacyjny (active), wyszukiwanie i sort składane warunkowo. Filtr `user_id`
 * redundantny względem RLS, ale jawny. Łańcuch sortowania kończy STAŁY tie-break (`created_at DESC` gdy
 * kolumna sortu ≠ created_at, potem zawsze `id ASC`) — `items.id` to losowy UUID (`gen_random_uuid`), więc
 * sam stabilizuje, ale układa losowo; `created_at DESC` daje chronologiczny porządek paczek bulk-akcji o
 * wspólnym `updated_at`, a `id` jest finalnym stabilizatorem. Odwzorowuje dotychczasową kolejność (F6).
 */
export async function listItems(supabase: SupabaseClient, userId: string, criteria: ListCriteria): Promise<Item[]> {
  let query = supabase.from("items").select(ITEM_COLUMNS).eq("user_id", userId);

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

  const { data, error } = await ordered.overrideTypes<Item[], { merge: false }>();
  if (error) throw new Error("Odczyt itemów nie powiódł się.", { cause: error });
  return data;
}

/** Pendingi usera („Elementy do akceptacji", FR-008). */
export function getPendingItems(supabase: SupabaseClient, userId: string): Promise<Item[]> {
  return listItems(supabase, userId, defaultCriteria("pending"));
}

/** Aktywne: accepted ze stanem `new`/`in_progress` (widok „Aktywne", S-04). */
export function getActiveItems(supabase: SupabaseClient, userId: string): Promise<Item[]> {
  return listItems(supabase, userId, defaultCriteria("active"));
}

/** Zakończone: accepted ze stanem `done` (widok „Zakończone", S-04). */
export function getDoneItems(supabase: SupabaseClient, userId: string): Promise<Item[]> {
  return listItems(supabase, userId, defaultCriteria("done"));
}

/** Anulowane: accepted ze stanem `cancelled` (widok „Anulowane", S-04). */
export function getCancelledItems(supabase: SupabaseClient, userId: string): Promise<Item[]> {
  return listItems(supabase, userId, defaultCriteria("cancelled"));
}

/**
 * Kosz (S-06): OBA statusy kosza — `rejected` (odrzucone w stagingu) ORAZ `deleted` (zaakceptowane
 * przeniesione do kosza). Karmi wyspę `TrashItemsView`, w której badge na karcie rozróżnia pochodzenie (FR-012).
 */
export function getTrashItems(supabase: SupabaseClient, userId: string): Promise<Item[]> {
  return listItems(supabase, userId, defaultCriteria("trash"));
}

/**
 * Wszystkie elementy JEDNEJ sesji importu bieżącego usera (S-10, master-detail) — odpowiednik `listItems`,
 * ale po `import_session_id` zamiast `view`. Sesja to SCOPE, nie widok: świadomie BEZ filtra
 * `acceptance_status`, więc panel dostaje wszystkie cztery stany naraz (`pending`/`accepted`/`rejected`/
 * `deleted`). Filtr `user_id` redundantny względem RLS (`items_select_own`), ale jawny — nieistniejąca lub
 * cudza sesja zwróci po prostu pustą listę (RLS odfiltrowuje), bez osobnego sprawdzania istnienia. Sort
 * `created_at ASC` (niezmienny dla elementu, więc zmiana stanu NIGDY nie przesuwa wiersza w panelu) + stały
 * tie-break `id ASC`. Reużywa `ITEM_COLUMNS` (kształt `Item` 1:1 z `listItems`).
 */
export async function getSessionItems(supabase: SupabaseClient, userId: string, sessionId: string): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items")
    .select(ITEM_COLUMNS)
    .eq("user_id", userId)
    .eq("import_session_id", sessionId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .overrideTypes<Item[], { merge: false }>();
  if (error) throw new Error("Odczyt elementów sesji nie powiódł się.", { cause: error });
  return data;
}
