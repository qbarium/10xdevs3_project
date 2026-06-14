// Mapowanie angielskich enumów bazy na polskie etykiety UI (separacja danych od prezentacji).
// Record<Union, string> wymusza kompletność mapowania w czasie kompilacji — dodanie wartości enum
// bez etykiety nie skompiluje się.

import type { AcceptanceStatus, ImportSessionStatus, ItemType, OperationalStatus } from "@/types";

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  task: "Zadanie",
  note: "Notatka",
  idea: "Pomysł",
  decision: "Decyzja",
  other: "Inne",
};

const OPERATIONAL_STATUS_LABELS: Record<OperationalStatus, string> = {
  new: "Nowe",
  in_progress: "W toku",
  done: "Zrobione",
  cancelled: "Anulowane",
};

const ACCEPTANCE_STATUS_LABELS: Record<AcceptanceStatus, string> = {
  pending: "Do akceptacji",
  accepted: "Zaakceptowane",
  rejected: "Odrzucone",
  deleted: "Usunięte",
};

const IMPORT_SESSION_STATUS_LABELS: Record<ImportSessionStatus, string> = {
  processing: "Przetwarzanie…",
  completed_with_items: "Gotowe",
  completed_no_items: "Brak wpisów",
  failed: "Błąd",
};

export function itemTypeLabel(type: ItemType): string {
  return ITEM_TYPE_LABELS[type];
}

export function operationalStatusLabel(status: OperationalStatus): string {
  return OPERATIONAL_STATUS_LABELS[status];
}

export function acceptanceStatusLabel(status: AcceptanceStatus): string {
  return ACCEPTANCE_STATUS_LABELS[status];
}

export function importSessionStatusLabel(status: ImportSessionStatus): string {
  return IMPORT_SESSION_STATUS_LABELS[status];
}

/** Polska odmiana rzeczownika „wpis" wg liczby (1 → wpis, 2–4 → wpisy, reszta → wpisów). */
export function entryNoun(n: number): string {
  if (n === 1) return "wpis";
  const tens = n % 100;
  const units = n % 10;
  if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) return "wpisy";
  return "wpisów";
}
