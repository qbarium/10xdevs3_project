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

// Nadpisania etykiet stanu operacyjnego per typ itemu (S-04, wyłom z FR-009). Punkt rozszerzenia
// pod przyszłe definiowanie etykiet per-typ; brak wpisu → fallback do generycznej etykiety
// z OPERATIONAL_STATUS_LABELS. Obecnie tylko testowe nadpisania stanu `done`.
const OPERATIONAL_STATUS_LABELS_BY_TYPE: Partial<Record<ItemType, Partial<Record<OperationalStatus, string>>>> = {
  note: { done: "Obsłużona" },
  idea: { done: "Obsłużony" },
  decision: { done: "Podjęta" },
  other: { done: "Obsłużone" },
};

const ACCEPTANCE_STATUS_LABELS: Record<AcceptanceStatus, string> = {
  pending: "Do akceptacji",
  accepted: "Zaakceptowane",
  rejected: "Odrzucone",
  deleted: "Usunięte",
};

// Pochodzenie itemu w koszu (S-06) — tylko dwa statusy mogą trafić do Kosza: `rejected` (odrzucony w
// stagingu) i `deleted` (zaakceptowany przeniesiony do kosza). Wąski typ (zamiast pełnego
// `AcceptanceStatus`) wyklucza kompilacyjnie pomyłkowe podanie `pending`/`accepted` — itemu o tym
// statusie z definicji nie ma w widoku Kosz. Etykiety pokrywają się z generycznymi, ale funkcja niesie
// intencję „pochodzenie w koszu" (badge na karcie).
const ACCEPTANCE_ORIGIN_LABELS: Record<"rejected" | "deleted", string> = {
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

/**
 * Etykieta stanu operacyjnego. Z `type` zwraca nadpisanie per-typ (np. `note` + `done` →
 * „Obsłużona"), a w razie jego braku — generyczną etykietę. Bez `type` zachowuje dotychczasowe
 * zachowanie (kompatybilność wsteczna istniejących callerów).
 */
export function operationalStatusLabel(status: OperationalStatus, type?: ItemType): string {
  if (type) {
    const override = OPERATIONAL_STATUS_LABELS_BY_TYPE[type]?.[status];
    if (override) return override;
  }
  return OPERATIONAL_STATUS_LABELS[status];
}

export function acceptanceStatusLabel(status: AcceptanceStatus): string {
  return ACCEPTANCE_STATUS_LABELS[status];
}

/** Etykieta pochodzenia itemu w koszu (S-06): `rejected` → „Odrzucone", `deleted` → „Usunięte". */
export function acceptanceOriginLabel(status: "rejected" | "deleted"): string {
  return ACCEPTANCE_ORIGIN_LABELS[status];
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
