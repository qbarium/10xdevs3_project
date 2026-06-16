// Czysta logika pod-filtra pochodzenia dla widoku Kosz (S-06). Wydzielona z islandu TrashItemsView, by
// była testowalna w środowisku node (bez DOM) — analogicznie do selection.ts / operational-view.ts /
// type-filter.ts. Filtr jest KLIENCKI: derywuje listę z już załadowanych itemów kosza (oba statusy),
// bez zapytań. Do usuwania przywróconych itemów z listy reużywamy `removeByIds` z selection.ts — tu
// żyje WYŁĄCZNIE pod-filtr (jedyny nowy helper).

import type { Item } from "@/types";

/** Pod-filtr pochodzenia w koszu: „wszystkie" / tylko odrzucone / tylko usunięte (przeniesione). */
export type TrashSubFilter = "all" | "rejected" | "deleted";

/**
 * Itemy spełniające pod-filtr pochodzenia: `all` przepuszcza oba statusy kosza, `rejected`/`deleted`
 * zawęża do jednego `acceptance_status`. Czysta funkcja: nie mutuje wejścia, zwraca nową tablicę.
 * Komponuje się z `applyTypeFilter` (filtr typu) — Kosz zawęża po obu wymiarach naraz.
 */
export function applyTrashSubFilter(items: readonly Item[], sub: TrashSubFilter): Item[] {
  return items.filter((item) => sub === "all" || item.acceptance_status === sub);
}
