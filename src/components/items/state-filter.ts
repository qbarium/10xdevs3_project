// Czysta logika osi stanu strony „Wpisy". Wydzielona z komponentu prezentacyjnego, by była testowalna w node
// (bez DOM) — wzorzec `operational-view.ts` / `type-filter.ts`. Po Fazie 3 `StateFilterSelect` renderuje oś jako
// ZAKŁADKI zakresu (`<a href>` z `navigateHref`) + przyciski podfiltra rodziny „active" (kliencki re-fetch) —
// nie jako `Select`. Wariant `Select` (`resolveStateSelection`/`stateSelectLabel`/`StateSelection`) usunięty
// jako martwy kod w Fazie 8 „Sprzątanie" (przegląd F3).
//
// Model 6 pozycji w kolejności cyklu życia (zgodnej z `BULK_TARGETS`): „Wszystko aktywne / Nowe / W toku"
// (rodzina „active" — ten sam widok `active`, różny `opstatus`) + „Zakończone / Anulowane / Kosz" (rodzina
// „nav" — osobne widoki-ścieżki). Konwencja bazy (patrz `list-criteria`): „który zbiór
// oglądam" = ŚCIEŻKA strony (nawigacja), „jak go zawężam" = parametr URL (kliencki re-fetch). Stąd
// heterogeniczny wybór: pozycja aktywna gdy JUŻ jesteśmy na `active` = kliencki podfiltr (`opstatus`);
// każda inna kombinacja = pełna nawigacja na stronę widoku.

import type { TypeFilterValue } from "@/components/items/type-filter";
import { operationalStatusLabel } from "@/lib/labels";
import { criteriaToQuery, defaultCriteria } from "@/lib/services/list-criteria";
import type { MainView } from "@/lib/services/list-criteria";
import type { OperationalStatus } from "@/types";

/** Pojedyncza pozycja rozwijanej listy stanu. `value` jest unikalne (wymóg shadcn `Select`). */
export interface StateFilterOption {
  /** Unikalna wartość string dla `Select` — koduje docelowy widok (+ `opstatus` dla rodziny „active"). */
  value: string;
  /** Etykieta PL widoczna w liście i triggerze. */
  label: string;
  /** Docelowy widok-ścieżka strony. */
  view: MainView;
  /** Podfiltr operacyjny — tylko rodzina „active"; `undefined` = „Wszystko aktywne" (bez zawężania stanu). */
  opstatus: OperationalStatus | undefined;
}

/**
 * Sześć pozycji filtra stanu w kolejności cyklu życia (`BULK_TARGETS`: new → in_progress → done → cancelled),
 * poprzedzone workiem „Wszystko aktywne" i zwieńczone Koszem. Rodzina „active" (pierwsze trzy) dzieli widok
 * `active` i różni się `opstatus`, więc potrzebuje ROZŁĄCZNYCH wartości (`active` / `active:new` /
 * `active:in_progress`). Etykiety stanów operacyjnych z kanonicznego `operationalStatusLabel` (spójne z badge'ami
 * listy i przyciskami bulk); „Wszystko aktywne" oraz etykiety widoków to literały (zgodne z dawnym `ENTRY_VIEWS`).
 */
export const STATE_FILTER_OPTIONS: readonly StateFilterOption[] = [
  { value: "active", label: "Wszystko aktywne", view: "active", opstatus: undefined },
  { value: "active:new", label: operationalStatusLabel("new"), view: "active", opstatus: "new" },
  {
    value: "active:in_progress",
    label: operationalStatusLabel("in_progress"),
    view: "active",
    opstatus: "in_progress",
  },
  { value: "done", label: "Zakończone", view: "done", opstatus: undefined },
  { value: "cancelled", label: "Anulowane", view: "cancelled", opstatus: undefined },
  { value: "trash", label: "Kosz", view: "trash", opstatus: undefined },
];

/**
 * Buduje adres nawigacji na stronę `view`, niosąc aktywny filtr rodzaju (`type`) oraz — dla nawigacji na
 * `active` — `opstatus`. Reużywa `criteriaToQuery` na domyślnych kryteriach widoku: dzięki temu emitowane są
 * WYŁĄCZNIE pola różne od domyślnych (czysty, krótki URL), a reguła „opstatus tylko dla active" jest
 * dziedziczona z serializatora (dla widoków innych niż active `opstatus` jest pomijane), nie duplikowana tutaj.
 */
export function navigateHref(view: MainView, type: TypeFilterValue, opstatus: OperationalStatus | undefined): string {
  const qs = criteriaToQuery({ ...defaultCriteria(view), type, opstatus });
  return qs ? `/items/${view}?${qs}` : `/items/${view}`;
}

/**
 * Zaznaczona pozycja listy dla bieżącego stanu: dla `active` wg `opstatus` (`new`/`in_progress`/brak →
 * „Wszystko aktywne"), dla pozostałych widoków wg samego `view`. Odwrotność wartości z `STATE_FILTER_OPTIONS`.
 */
export function stateSelectValue(view: MainView, opstatus: OperationalStatus | undefined): string {
  if (view === "active") {
    if (opstatus === "new") return "active:new";
    if (opstatus === "in_progress") return "active:in_progress";
    return "active";
  }
  return view;
}
