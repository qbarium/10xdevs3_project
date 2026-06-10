// Mapowanie angielskich enumów bazy na polskie etykiety UI (separacja danych od prezentacji).
// Record<Union, string> wymusza kompletność mapowania w czasie kompilacji — dodanie wartości enum
// bez etykiety nie skompiluje się.

import type { AcceptanceStatus, ItemType, OperationalStatus } from "@/types";

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

export function itemTypeLabel(type: ItemType): string {
  return ITEM_TYPE_LABELS[type];
}

export function operationalStatusLabel(status: OperationalStatus): string {
  return OPERATIONAL_STATUS_LABELS[status];
}

export function acceptanceStatusLabel(status: AcceptanceStatus): string {
  return ACCEPTANCE_STATUS_LABELS[status];
}
