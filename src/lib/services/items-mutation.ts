// Mutacje `items` nad klientem Supabase z RLS (cookies usera, NIE service_role): zbiorcza zmiana
// `acceptance_status`/`operational_status` oraz edycja itemu (pending|accepted, S-05). Każdy UPDATE
// jest status-guarded — bulki strzegą `eq('acceptance_status', …)`, a edycja `in('acceptance_status',
// ['pending','accepted'])` — guard realizuje FR-007 ("działa tylko na uprawnionych, reszta pomijana
// bez błędu") i chroni przed mutacją itemu zmienionego w innej karcie (stale UI). Edycja dokłada
// compare-and-swap na `updated_at` (optimistic concurrency → 409). RLS dokłada `user_id` (polityka
// `items_update_own` ma klauzulę USING) — izolacja per-user bez jawnego filtra.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CreateItemInput, EditItemInput } from "@/lib/validation/items";
import type { AcceptanceStatus, Item, ItemType, OperationalStatus } from "@/types";

const ITEM_COLUMNS =
  "id, user_id, import_session_id, type, title, description, acceptance_status, operational_status, created_at, updated_at";

/** Statusy akceptacji, w których item jest edytowalny (S-05): `pending` ORAZ `accepted`. */
const EDITABLE_ACCEPTANCE: readonly AcceptanceStatus[] = ["pending", "accepted"];

/** Rzucane, gdy edytowany item nie istnieje, jest nie-własny lub ma nieedytowalny status (`rejected`/`deleted`). */
export class ItemNotEditableError extends Error {
  constructor() {
    super("Item nie istnieje lub nie jest już edytowalny.");
    this.name = "ItemNotEditableError";
  }
}

/**
 * Rzucane, gdy item istnieje i JEST edytowalny, ale jego `updated_at` rozjechał się z oczekiwanym
 * (równoległa edycja gdzie indziej) — compare-and-swap odrzuca cichy zapis. Endpoint → 409. Odróżnia
 * „ktoś nadpisał w międzyczasie" od „item zniknął/niedostępny" (`ItemNotEditableError` → 404).
 */
export class ItemConflictError extends Error {
  constructor() {
    super("Item został zmieniony w innym miejscu — odśwież i spróbuj ponownie.");
    this.name = "ItemConflictError";
  }
}

/**
 * Kanoniczne miejsce derywacji `operational_status` z typu w warstwie aplikacji — przy TWORZENIU
 * itemu. Od S-04 stan operacyjny obejmuje WSZYSTKIE typy (świadomy wyłom z FR-009), więc każdy item —
 * niezależnie od typu — powstaje z `'new'`. Spójne z RPC `persist_classification` po migracji
 * `operational_status_all_types` (wcześniej `'new'` dostawał tylko `task`). UWAGA (S-05): edycja
 * itemu NIE wywołuje już tej funkcji — `editItem` celowo nie dotyka `operational_status` (decyzja #3),
 * by zachować postęp accepted. Parametr `_type` zachowany pod przyszłą derywację per-typ (etykiety S-04).
 */
export function deriveOperationalStatus(_type: ItemType): OperationalStatus {
  return "new";
}

/**
 * Tworzy pojedynczy item RĘCZNY (S-07) z niezmiennikami ustalonymi po stronie SERWERA, nie klienta:
 * `acceptance_status='accepted'` (pomija kolejkę pendingów i klasyfikację AI — item od razu na liście
 * Aktywne), `operational_status` z `deriveOperationalStatus(type)` (=`'new'`), `import_session_id=NULL`
 * (item ręczny nie należy do żadnej sesji importu — FR-027), `user_id` z sesji. Klient przysyła WYŁĄCZNIE
 * `title`/`description`/`type` (`CreateItemInput`), więc payloadu nie da się podrobić, by wstawić item w
 * obcym stanie — fail-closed. `updated_at` jawnie (wzorzec mutacji S-04, spójny z `editItem`). RLS dokłada
 * izolację per-user (polityka `items_insert_own` z `with check auth.uid() = user_id`). `.select(ITEM_COLUMNS)
 * .single()` zwraca pełny, stabilny kształt `Item` (jak `editItem`/`items.ts`), NIE `'*'`.
 */
export async function createManualItem(
  supabase: SupabaseClient,
  userId: string,
  input: CreateItemInput,
): Promise<Item> {
  const { data, error } = await supabase
    .from("items")
    .insert({
      user_id: userId,
      import_session_id: null,
      type: input.type,
      title: input.title,
      description: input.description,
      acceptance_status: "accepted",
      operational_status: deriveOperationalStatus(input.type),
      updated_at: new Date().toISOString(),
    })
    .select(ITEM_COLUMNS)
    .single<Item>();
  if (error) throw new Error("Utworzenie itemu nie powiodło się.", { cause: error });
  return data;
}

/**
 * Zbiorcza zmiana statusu akceptacji zaznaczonych pendingów jednym atomowym statementem.
 * Guard `pending` w WHERE → itemy poza zbiorem `pending` po prostu nie pasują (`.select` ich nie
 * zwróci), więc zwracane `updatedIds` to dokładnie wiersze faktycznie zmienione (reszta pominięta,
 * bez błędu — FR-007).
 */
export async function setAcceptanceStatus(
  supabase: SupabaseClient,
  ids: string[],
  status: "accepted" | "rejected",
): Promise<{ updatedIds: string[] }> {
  const { data, error } = await supabase
    .from("items")
    .update({ acceptance_status: status, updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("acceptance_status", "pending")
    .select("id")
    .overrideTypes<{ id: string }[], { merge: false }>();
  if (error) throw new Error("Zmiana statusu akceptacji nie powiodła się.", { cause: error });
  return { updatedIds: data.map((row) => row.id) };
}

/**
 * Zbiorcza zmiana `operational_status` accepted itemów jednym atomowym statementem (S-04). Klon
 * `setAcceptanceStatus` z innym polem i guardem: WHERE strzeże `accepted` (NIE `pending`) — itemy
 * nie-`accepted` w `ids` nie pasują, `.select` ich nie zwróci, więc `updatedIds` to dokładnie
 * wiersze faktycznie zmienione (reszta pominięta bez błędu — FR-007). Brak warunku na `type`:
 * po S-04 wszystkie typy mają stan. `status` może być dowolnym z 4 (przechodniość na danych);
 * kuracja widocznych przejść to warstwa UX (Faza 4).
 */
export async function setOperationalStatus(
  supabase: SupabaseClient,
  ids: string[],
  status: OperationalStatus,
): Promise<{ updatedIds: string[] }> {
  const { data, error } = await supabase
    .from("items")
    .update({ operational_status: status, updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("acceptance_status", "accepted")
    .select("id")
    .overrideTypes<{ id: string }[], { merge: false }>();
  if (error) throw new Error("Zmiana stanu operacyjnego nie powiodła się.", { cause: error });
  return { updatedIds: data.map((row) => row.id) };
}

/**
 * Przeniesienie zaakceptowanych itemów do kosza (S-06, FR-013) jednym atomowym statementem. Guard
 * `accepted` w WHERE → tylko zaakceptowane przeskakują na `deleted`; itemy w innym stanie nie pasują,
 * `.select` ich nie zwróci, więc `updatedIds` to dokładnie wiersze faktycznie przeniesione (reszta
 * pominięta bez błędu — FR-007). `updated_at=now()` wypycha item na górę docelowych widoków (sortowanie
 * po `updated_at DESC`). Stan operacyjny NIETKNIĘTY — kosz i stan operacyjny to dwa niezależne wymiary
 * (FR-009), więc po przywróceniu item wraca dokładnie do swojego stanu.
 */
export async function moveToTrash(supabase: SupabaseClient, ids: string[]): Promise<{ updatedIds: string[] }> {
  const { data, error } = await supabase
    .from("items")
    .update({ acceptance_status: "deleted", updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("acceptance_status", "accepted")
    .select("id")
    .overrideTypes<{ id: string }[], { merge: false }>();
  if (error) throw new Error("Przeniesienie do kosza nie powiodło się.", { cause: error });
  return { updatedIds: data.map((row) => row.id) };
}

/**
 * Przywrócenie itemów z kosza (S-06, FR-013) — DWUKIERUNKOWE, cofa ostatnią tranzycję akceptacji.
 * Mieszana selekcja (rejected + deleted) wymaga DWÓCH guarded UPDATE-ów, każdy strzeżony bieżącym
 * statusem źródłowym: `deleted → accepted` ORAZ `rejected → pending`. Restore jest deterministyczny z
 * samego statusu (jedyne źródło `deleted` to move-to-trash z `accepted`; jedyne źródło `rejected` to
 * reject z `pending`), więc nie potrzeba kolumny „previous_status". `updatedIds` to suma obu — wiersze
 * faktycznie przywrócone (reszta pominięta bez błędu — FR-007). Oba UPDATE-y NIE są wspólnie
 * transakcyjne (świadome ograniczenie solo-MVP): gdy drugi rzuci po zatwierdzeniu pierwszego, endpoint
 * zwróci 500, ale stan per-item pozostaje spójny (każdy w prawidłowym statusie) — bez korupcji.
 */
export async function restoreFromTrash(supabase: SupabaseClient, ids: string[]): Promise<{ updatedIds: string[] }> {
  const now = new Date().toISOString();
  const { data: restoredDeleted, error: deletedError } = await supabase
    .from("items")
    .update({ acceptance_status: "accepted", updated_at: now })
    .in("id", ids)
    .eq("acceptance_status", "deleted")
    .select("id")
    .overrideTypes<{ id: string }[], { merge: false }>();
  if (deletedError) throw new Error("Przywrócenie z kosza nie powiodło się.", { cause: deletedError });

  const { data: restoredRejected, error: rejectedError } = await supabase
    .from("items")
    .update({ acceptance_status: "pending", updated_at: now })
    .in("id", ids)
    .eq("acceptance_status", "rejected")
    .select("id")
    .overrideTypes<{ id: string }[], { merge: false }>();
  if (rejectedError) throw new Error("Przywrócenie z kosza nie powiodło się.", { cause: rejectedError });

  return { updatedIds: [...restoredDeleted, ...restoredRejected].map((row) => row.id) };
}

/**
 * Trwałe opróżnienie kosza usera (S-06, FR-016) — PIERWSZY i jedyny twardy DELETE w aplikacji (reszta
 * cyklu życia to soft-delete przez `acceptance_status`). Kasuje WSZYSTKIE wiersze kosza (`rejected` +
 * `deleted`); RLS (`items_delete_own`, `(select auth.uid()) = user_id`) dokłada izolację per-user, więc
 * bez jawnego filtra `user_id` user kasuje wyłącznie swój kosz. Brak `ids` — operacja globalna, nie na
 * liście. `deletedCount` z `.select("id")` (liczba faktycznie skasowanych wierszy) zasila komunikat UI.
 */
export async function emptyTrash(supabase: SupabaseClient): Promise<{ deletedCount: number }> {
  const { data, error } = await supabase
    .from("items")
    .delete()
    .in("acceptance_status", ["rejected", "deleted"])
    .select("id")
    .overrideTypes<{ id: string }[], { merge: false }>();
  if (error) throw new Error("Opróżnienie kosza nie powiodło się.", { cause: error });
  return { deletedCount: data.length };
}

/**
 * Edycja pojedynczego itemu (title/description/type/operationalStatus) dla `pending` ORAZ `accepted`
 * (S-05). `operational_status` jest ustawiany JAWNIE z wejścia — UI prefilluje bieżącą wartość, więc
 * edycja treści bez tknięcia selektora zachowuje stan; cichy reset przez auto-derywację (`→'new'`,
 * pierwotne ryzyko decyzji #3) nie wraca, bo zapisujemy wartość podaną, nie derywowaną. Compare-and-swap:
 * UPDATE strzeże `in('acceptance_status', ['pending','accepted'])` + `eq('updated_at', expectedUpdatedAt)`,
 * więc trafia tylko w edytowalny wiersz o niezmienionym znaczniku.
 *
 * 0 wierszy jest NIEJEDNOZNACZNE (item nie istnieje/nieedytowalny vs nieaktualny `updated_at`), więc
 * rozróżniamy follow-up SELECT-em po `id` (RLS-scoped): wiersz istnieje i ma edytowalny status, lecz
 * UPDATE go nie złapał ⇒ jedyną przyczyną mógł być rozjazd `updated_at` ⇒ `ItemConflictError` (→409);
 * w przeciwnym razie ⇒ `ItemNotEditableError` (→404). Zwraca pełny, zaktualizowany wiersz.
 */
export async function editItem(
  supabase: SupabaseClient,
  id: string,
  input: EditItemInput,
  expectedUpdatedAt: string,
): Promise<Item> {
  const { data, error } = await supabase
    .from("items")
    .update({
      title: input.title,
      description: input.description,
      type: input.type,
      operational_status: input.operationalStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("acceptance_status", EDITABLE_ACCEPTANCE)
    // Compare-and-swap na znaczniku — porównanie TEKSTOWE. Inwariant: klient odsyła `expectedUpdatedAt`
    // dosłownie z chwili otwarcia (bez re-formatowania typu `new Date(...).toISOString()`), inaczej różnica
    // reprezentacji (mikrosekundy/offset) dałaby fałszywy 409. Patrz EditItemDialog.handleSave.
    .eq("updated_at", expectedUpdatedAt)
    .select(ITEM_COLUMNS)
    .maybeSingle<Item>();
  if (error) throw new Error("Edycja itemu nie powiodła się.", { cause: error });
  if (data) return data;

  // Dyskryminacja 0-wierszowego UPDATE: SELECT po `id` (RLS dokłada user_id — obcy item → null).
  const { data: existing, error: selectError } = await supabase
    .from("items")
    .select("acceptance_status")
    .eq("id", id)
    .maybeSingle<{ acceptance_status: AcceptanceStatus }>();
  if (selectError) throw new Error("Edycja itemu nie powiodła się.", { cause: selectError });
  if (existing && EDITABLE_ACCEPTANCE.includes(existing.acceptance_status)) throw new ItemConflictError();
  throw new ItemNotEditableError();
}
