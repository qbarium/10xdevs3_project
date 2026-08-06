// Oś stanu strony „Wpisy" w szacie „technicznej" (S-15 Faza 9): JEDEN płaski rząd 5 zakładek-linków.
// Po konsolidacji (Faza 9) model jest JEDNORODNY: każda z 5 pozycji `STATE_FILTER_OPTIONS` to pełna
// NAWIGACJA `<a href>` na stronę widoku (świeży render SSR), z adresem z `navigateHref` (niesie aktywny
// filtr rodzaju `?type=`). Dotyczy to także rodziny „active": „Nowe"/„W toku" wskazują teraz
// `/items/active?opstatus=new|in_progress` — dawny kliencki podfiltr (re-fetch bez przeładowania) zniknął.
// Podświetlana jest DOKŁADNIE JEDNA pozycja, liczona z pary (widok + `opstatus`) przez `stateSelectValue`
// (round-trip modelu gwarantuje trafienie), więc „Aktywne" nie świeci razem z „Nowe"/„W toku".
// Etykiety z modelu (`STATE_FILTER_OPTIONS`, zamrożone przez `state-filter.test.ts`); jedyny wyjątek
// prezentacyjny: „Wszystko aktywne" pokazujemy na zakładce zwięźle jako „Aktywne" (model bez zmian).

import { navigateHref, STATE_FILTER_OPTIONS, stateSelectValue } from "@/components/items/state-filter";
import type { StateFilterOption } from "@/components/items/state-filter";
import type { TypeFilterValue } from "@/components/items/type-filter";
import type { MainView } from "@/lib/services/list-criteria";
import { cn } from "@/lib/utils";
import type { OperationalStatus } from "@/types";

interface Props {
  /** Bieżący widok-ścieżka strony — wraz z `opstatus` wyznacza podświetloną zakładkę. */
  view: MainView;
  /** Aktywny filtr rodzaju itemu (żywe kryteria wyspy) — przenoszony do adresu docelowego zakładek. */
  type: TypeFilterValue;
  /** Bieżący podfiltr operacyjny (żywe kryteria) — dopełnia `view` przy liczeniu podświetlonej pozycji. */
  opstatus: OperationalStatus | undefined;
}

/**
 * Etykieta prezentacyjna zakładki. „Wszystko aktywne" (etykieta modelu, zamrożona przez `state-filter.test.ts`)
 * pokazujemy na osi zwięźle jako „Aktywne"; pozostałe pozycje biorą etykietę wprost z modelu.
 */
function tabLabel(option: StateFilterOption): string {
  return option.value === "active" ? "Aktywne" : option.label;
}

export default function StateFilterSelect({ view, type, opstatus }: Props) {
  const selectedValue = stateSelectValue(view, opstatus);

  return (
    <nav className="border-border flex gap-0.5 border-b" aria-label="Zakres wpisów">
      {STATE_FILTER_OPTIONS.map((option) => {
        const active = option.value === selectedValue;
        return (
          <a
            key={option.value}
            href={navigateHref(option.view, type, option.opstatus)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-[13.5px] font-medium transition-colors",
              active
                ? "border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {tabLabel(option)}
          </a>
        );
      })}
    </nav>
  );
}
