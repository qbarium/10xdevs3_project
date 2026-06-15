// Czysta logika rekonsyliacji listy po zmianie stanu operacyjnego (S-04). Wydzielona z islandu
// AcceptedItemsView, by była testowalna w środowisku node (bez DOM) — analogicznie do selection.ts.
// Wzorzec „remove-on-change" pessimistic: po sukcesie serwera item, którego NOWY stan nie spełnia
// predykatu bieżącego widoku, znika z listy (jak remove-on-accept z S-03).

import type { Item, OperationalStatus } from "@/types";

/** Trzy widoki filtra głównego z interaktywnym stanem operacyjnym. */
export type AcceptedView = "active" | "done" | "cancelled";

/**
 * Czy item o danym stanie operacyjnym należy do widoku: Aktywne = `new`|`in_progress`,
 * Zakończone = `done`, Anulowane = `cancelled`. `null` (teoretyczne po backfillu) → nie należy.
 */
export function matchesView(status: OperationalStatus | null, view: AcceptedView): boolean {
  if (!status) return false;
  if (view === "active") return status === "new" || status === "in_progress";
  if (view === "done") return status === "done";
  return status === "cancelled";
}

/**
 * Po udanej zmianie stanu: nadaje `target` itemom z `ids` (odbicie nowego stanu w UI), po czym usuwa
 * te, których nowy stan nie spełnia predykatu widoku. Item zmieniony w obrębie predykatu (np.
 * `new`→`in_progress` na Aktywne) zostaje z zaktualizowanym stanem; item wychodzący poza predykat
 * (np. `new`→`done` na Aktywne) znika.
 */
export function reconcileAfterChange(
  items: readonly Item[],
  ids: ReadonlySet<string>,
  target: OperationalStatus,
  view: AcceptedView,
): Item[] {
  return items
    .map((item) => (ids.has(item.id) ? { ...item, operational_status: target } : item))
    .filter((item) => matchesView(item.operational_status, view));
}
