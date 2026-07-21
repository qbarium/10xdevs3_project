// Jedna rozwijana lista osi stanu strony „Wpisy" (konsolidacja: zastąpiła parę [rozwijana lista widoku +
// pigułki podfiltra operacyjnego]). Sześć pozycji w kolejności cyklu życia: Wszystko aktywne / Nowe / W toku
// / Zakończone / Anulowane / Kosz (płasko, bez separatora). Wybór jest HETEROGENICZNY — cała decyzja
// „wartość → akcja" żyje w `resolveStateSelection` (state-filter.ts, testowana w node):
//   - pozycja aktywna gdy JUŻ jesteśmy na `active` → kliencki podfiltr (`onSelectActiveSubfilter`, re-fetch
//     bez przeładowania; wyspa czyści zaznaczenie + reset strony — parytet dawnych pigułek),
//   - każda inna kombinacja → pełna nawigacja `window.location.assign` na stronę widoku (świeży render SSR),
//     niosąc filtr rodzaju (`?type=`) i — przy nawigacji na `active` — `opstatus`.
// Etykieta zaznaczonej pozycji renderowana JAWNIE w `SelectValue` (SSR bez mignięcia — wzorzec SessionFilterBar).

import {
  resolveStateSelection,
  STATE_FILTER_OPTIONS,
  stateSelectLabel,
  stateSelectValue,
} from "@/components/items/state-filter";
import type { TypeFilterValue } from "@/components/items/type-filter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MainView } from "@/lib/services/list-criteria";
import type { OperationalStatus } from "@/types";

interface Props {
  /** Bieżący widok-ścieżka strony (steruje gałęzią podfiltr vs nawigacja). */
  view: MainView;
  /** Aktywny filtr rodzaju itemu (żywe kryteria wyspy) — przenoszony do adresu docelowego przy nawigacji. */
  type: TypeFilterValue;
  /** Bieżący podfiltr operacyjny (żywe kryteria) — wyznacza zaznaczoną pozycję rodziny „active". */
  opstatus: OperationalStatus | undefined;
  /**
   * Kliencki podfiltr operacyjny (re-fetch bez przeładowania) — wołany TYLKO gdy jesteśmy na `active` i wybrano
   * pozycję rodziny „active". Wyspa ma tu replikować dawną ścieżkę pigułek (czyszczenie zaznaczenia + reset
   * strony). Pominięty tam, gdzie pozycje aktywne rozwiązują się do nawigacji (np. Kosz).
   */
  onSelectActiveSubfilter?: (opstatus: OperationalStatus | undefined) => void;
}

export default function StateFilterSelect({ view, type, opstatus, onSelectActiveSubfilter }: Props) {
  const value = stateSelectValue(view, opstatus);
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const selection = resolveStateSelection(next, { view, type });
        if (selection.kind === "subfilter") {
          onSelectActiveSubfilter?.(selection.opstatus);
        } else {
          window.location.assign(selection.href);
        }
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label="Filtr stanu wpisów"
        className="w-[184px] rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
      >
        <SelectValue>{stateSelectLabel(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {STATE_FILTER_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
