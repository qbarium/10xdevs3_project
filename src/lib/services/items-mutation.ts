// Mutacje `items` nad klientem Supabase z RLS (cookies usera, NIE service_role): zbiorcza zmiana
// `acceptance_status`/`operational_status` oraz edycja itemu (pending|accepted, S-05). Każdy UPDATE
// jest status-guarded — bulki strzegą `eq('acceptance_status', …)`, a edycja `in('acceptance_status',
// ['pending','accepted'])` — guard realizuje FR-007 ("działa tylko na uprawnionych, reszta pomijana
// bez błędu") i chroni przed mutacją itemu zmienionego w innej karcie (stale UI). Edycja dokłada
// compare-and-swap na `updated_at` (optimistic concurrency → 409). RLS dokłada `user_id` (polityka
// `items_update_own` ma klauzulę USING) — izolacja per-user bez jawnego filtra.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EditItemInput } from "@/lib/validation/items";
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
