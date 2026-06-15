// Mutacje `items` nad klientem Supabase z RLS (cookies usera, NIE service_role): zbiorcza zmiana
// `acceptance_status` oraz edycja pendingu. KAŻDY UPDATE jest status-guarded (`eq('acceptance_status',
// 'pending')`) — guard realizuje FR-007 ("działa tylko na uprawnionych, reszta pomijana bez błędu")
// i chroni przed mutacją itemu zaakceptowanego w innej karcie (stale UI). RLS dokłada `user_id`
// (polityka `items_update_own` ma klauzulę USING) — izolacja per-user bez jawnego filtra.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EditItemInput } from "@/lib/validation/items";
import type { Item, ItemType, OperationalStatus } from "@/types";

const ITEM_COLUMNS =
  "id, user_id, import_session_id, type, title, description, acceptance_status, operational_status, created_at, updated_at";

/** Rzucane, gdy edytowany item nie jest już `pending` (nie-własny lub zaakceptowany w innej karcie). */
export class ItemNotEditableError extends Error {
  constructor() {
    super("Item nie istnieje lub nie jest już edytowalny.");
    this.name = "ItemNotEditableError";
  }
}

/**
 * Jedyne miejsce derywacji `operational_status` z typu w warstwie aplikacji. Od S-04 stan
 * operacyjny obejmuje WSZYSTKIE typy (świadomy wyłom z FR-009), więc każdy item — niezależnie
 * od typu — powstaje i jest edytowany z `'new'`. Spójne z RPC `persist_classification` po migracji
 * `operational_status_all_types` (wcześniej `'new'` dostawał tylko `task`). Parametr `_type`
 * zachowany w sygnaturze pod przyszłą derywację per-typ (architektura etykiet per-typ z S-04).
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
 * Edycja pojedynczego pendingu (title/description/type). Derywuje `operational_status` z typu.
 * Guard `pending` → gdy item nie jest już edytowalny, `.maybeSingle()` zwraca `null` (bez błędu),
 * co mapujemy na `ItemNotEditableError` (endpoint → 404). Zwraca pełny, zaktualizowany wiersz.
 */
export async function editPendingItem(supabase: SupabaseClient, id: string, input: EditItemInput): Promise<Item> {
  const { data, error } = await supabase
    .from("items")
    .update({
      title: input.title,
      description: input.description,
      type: input.type,
      operational_status: deriveOperationalStatus(input.type),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("acceptance_status", "pending")
    .select(ITEM_COLUMNS)
    .maybeSingle<Item>();
  if (error) throw new Error("Edycja itemu nie powiodła się.", { cause: error });
  if (!data) throw new ItemNotEditableError();
  return data;
}
