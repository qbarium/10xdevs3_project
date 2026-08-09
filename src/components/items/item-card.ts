// Czysta logika wspólnej karty wpisu (S-13 F3): reguły „stan akceptacji → dozwolone akcje", testowane
// w node (konwencja projektu: logika w `.ts`, render w `.tsx`). `ItemCard.tsx` renderuje akcję TYLKO gdy
// podano handler ORAZ stan wpisu na nią pozwala — ta tabela jest jedynym źródłem drugiej połowy warunku.
// Semantyka luster: guardy serwera (edycja nie-pending/accepted → 404, trash na nie-accepted → no-op).

import type { AcceptanceStatus } from "@/types";

/** Akcje pojedyncze karty wpisu (wspólne dla widoków głównych i trybu sesji). */
export type ItemAction = "edit" | "accept" | "reject" | "trash" | "restore" | "preview" | "delete";

/**
 * Dozwolone akcje per stan akceptacji:
 *  - `pending`  → edycja / akceptuj / odrzuć (staging, FR-007);
 *  - `accepted` → edycja / do kosza;
 *  - `rejected` i `deleted` → podgląd (read-only) / przywróć / trwałe usunięcie (kosz w obu kierunkach, S-06).
 * `Record` wymusza kompletność w czasie kompilacji (nowy stan bez wpisu się nie skompiluje).
 */
const ACTIONS_BY_STATUS: Record<AcceptanceStatus, readonly ItemAction[]> = {
  pending: ["edit", "accept", "reject"],
  accepted: ["edit", "trash"],
  rejected: ["preview", "restore", "delete"],
  deleted: ["preview", "restore", "delete"],
};

/** Lista akcji dozwolonych dla stanu (kolejność bez znaczenia — o układzie decyduje karta). */
export function allowedActions(status: AcceptanceStatus): readonly ItemAction[] {
  return ACTIONS_BY_STATUS[status];
}

/** Czy akcja jest dozwolona dla stanu — warunek renderu akcji w `ItemCard` (drugi to obecność handlera). */
export function isActionAllowed(status: AcceptanceStatus, action: ItemAction): boolean {
  return ACTIONS_BY_STATUS[status].includes(action);
}
