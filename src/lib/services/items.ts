// Odczyt itemów nad klientem Supabase z RLS (cookies usera). Filtry główne listy (FR-008):
// pendingi („Elementy do akceptacji", S-02) oraz zaakceptowane/odrzucone (Aktywne/Kosz, S-03).
// Trzy widoki są symetryczne — różni je wyłącznie `acceptance_status`, więc dzielą jeden trzon.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AcceptanceStatus, Item, OperationalStatus } from "@/types";

const ITEM_COLUMNS =
  "id, user_id, import_session_id, type, title, description, acceptance_status, operational_status, created_at, updated_at";

/**
 * Itemy usera o danym statusie akceptacji, najnowsze pierwsze. Filtr `user_id` redundantny względem
 * RLS, ale jawny. Wspólny trzon dla trzech filtrów głównych (pending / accepted / rejected).
 */
async function listByAcceptance(supabase: SupabaseClient, userId: string, status: AcceptanceStatus): Promise<Item[]> {
  const base = supabase.from("items").select(ITEM_COLUMNS).eq("user_id", userId).eq("acceptance_status", status);
  // Pendingi: kolejność tworzenia (stabilna — edycja nie przestawia), `id` jako tie-breaker.
  // Aktywne/Kosz: najpierw RECENCY AKCJI (`updated_at`) → świeżo zatwierdzone/odrzucone na górze;
  // w obrębie jednej akcji zbiorczej `updated_at` jest wspólny (jeden statement), więc rozstrzyga
  // `created_at, id` — IDENTYCZNIE jak na liście pendingów, więc grupa zachowuje wewnętrzną kolejność.
  // (Paczka z jednego INSERT-u ma wspólny `created_at`; `id` to finalny deterministyczny tie-breaker.)
  const ordered =
    status === "pending"
      ? base.order("created_at", { ascending: false }).order("id", { ascending: true })
      : base
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: true });
  const { data, error } = await ordered.overrideTypes<Item[], { merge: false }>();
  if (error) throw new Error("Odczyt itemów nie powiódł się.", { cause: error });
  return data;
}

/** Pendingi usera („Elementy do akceptacji", FR-008). */
export function getPendingItems(supabase: SupabaseClient, userId: string): Promise<Item[]> {
  return listByAcceptance(supabase, userId, "pending");
}

/** Odrzucone itemy usera (widok „Kosz", S-03; read-only — przenieś/przywróć/wyczyść → S-06). */
export function getRejectedItems(supabase: SupabaseClient, userId: string): Promise<Item[]> {
  return listByAcceptance(supabase, userId, "rejected");
}

/**
 * Itemy usera w koszu (S-06): OBA statusy kosza — `rejected` (odrzucone w stagingu) ORAZ `deleted`
 * (zaakceptowane przeniesione do kosza). Karmi wyspę `TrashItemsView`, w której pod-filtr rozróżnia
 * pochodzenie. Sortowanie jak pozostałe widoki nie-pending (recency akcji → `updated_at DESC`, potem
 * `created_at DESC, id ASC`), więc świeżo przeniesiony/odrzucony item ląduje na górze. `listByAcceptance`
 * nie pasuje (bierze pojedynczy status), więc to osobny statement z `.in(...)`.
 */
export async function getTrashItems(supabase: SupabaseClient, userId: string): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items")
    .select(ITEM_COLUMNS)
    .eq("user_id", userId)
    .in("acceptance_status", ["rejected", "deleted"])
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .overrideTypes<Item[], { merge: false }>();
  if (error) throw new Error("Odczyt itemów nie powiódł się.", { cause: error });
  return data;
}

/**
 * Zaakceptowane itemy usera zawężone predykatem stanu operacyjnego, sortowane jak pozostałe widoki
 * accepted (recency akcji → `updated_at DESC`, potem `created_at DESC, id ASC`). Trzy widoki filtra
 * głównego S-04 (Aktywne/Zakończone/Anulowane) różni wyłącznie zbiór `operational_status` — rozłączny,
 * bo każdy item ma dokładnie jeden stan. Indeks `(user_id, acceptance_status, operational_status)`
 * pokrywa ten filtr (migracja S-04).
 */
async function listAcceptedByOperational(
  supabase: SupabaseClient,
  userId: string,
  operational: OperationalStatus[],
): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items")
    .select(ITEM_COLUMNS)
    .eq("user_id", userId)
    .eq("acceptance_status", "accepted")
    .in("operational_status", operational)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .overrideTypes<Item[], { merge: false }>();
  if (error) throw new Error("Odczyt itemów nie powiódł się.", { cause: error });
  return data;
}

/** Aktywne: accepted ze stanem `new`/`in_progress` (widok „Aktywne", S-04). */
export function getActiveItems(supabase: SupabaseClient, userId: string): Promise<Item[]> {
  return listAcceptedByOperational(supabase, userId, ["new", "in_progress"]);
}

/** Zakończone: accepted ze stanem `done` (widok „Zakończone", S-04). */
export function getDoneItems(supabase: SupabaseClient, userId: string): Promise<Item[]> {
  return listAcceptedByOperational(supabase, userId, ["done"]);
}

/** Anulowane: accepted ze stanem `cancelled` (widok „Anulowane", S-04). */
export function getCancelledItems(supabase: SupabaseClient, userId: string): Promise<Item[]> {
  return listAcceptedByOperational(supabase, userId, ["cancelled"]);
}
