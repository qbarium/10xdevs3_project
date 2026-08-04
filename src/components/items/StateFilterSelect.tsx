// Oś stanu strony „Wpisy" w szacie „technicznej" (S-15 Faza 3): zakładki zakresu + podfiltr rodziny „active".
// Model jest HETEROGENICZNY (patrz `state-filter.ts`):
//   - 4 zakładki zakresu (Aktywne / Zakończone / Anulowane / Kosz) = pełna NAWIGACJA `<a href>` na stronę
//     widoku (świeży render SSR), z adresem z `navigateHref` (niesie aktywny filtr rodzaju `?type=`);
//   - podfiltr rodziny „active" (Wszystko aktywne / Nowe / W toku) = kliencki PODFILTR `opstatus` (re-fetch
//     bez przeładowania) — renderowany TYLKO na `active`, bo tylko tam ma sens (i tylko tam podano handler).
// Etykiety zakresów to literały spójne z makietą; etykiety podfiltra z `STATE_FILTER_OPTIONS` (zamrożone).

import { navigateHref, STATE_FILTER_OPTIONS, stateSelectValue } from "@/components/items/state-filter";
import type { TypeFilterValue } from "@/components/items/type-filter";
import type { MainView } from "@/lib/services/list-criteria";
import { cn } from "@/lib/utils";
import type { OperationalStatus } from "@/types";

interface Props {
  /** Bieżący widok-ścieżka strony (wyznacza aktywną zakładkę i steruje gałęzią podfiltr vs nawigacja). */
  view: MainView;
  /** Aktywny filtr rodzaju itemu (żywe kryteria wyspy) — przenoszony do adresu docelowego zakładek. */
  type: TypeFilterValue;
  /** Bieżący podfiltr operacyjny (żywe kryteria) — wyznacza zaznaczoną pozycję rodziny „active". */
  opstatus: OperationalStatus | undefined;
  /**
   * Kliencki podfiltr operacyjny (re-fetch bez przeładowania) — wołany TYLKO gdy jesteśmy na `active`.
   * Wyspa replikuje dawną ścieżkę pigułek (czyszczenie zaznaczenia + reset strony). Pominięty na innych
   * widokach (Kosz/Zakończone/Anulowane), gdzie podfiltr się nie renderuje.
   */
  onSelectActiveSubfilter?: (opstatus: OperationalStatus | undefined) => void;
}

/** Cztery zakładki zakresu w kolejności cyklu życia — etykiety spójne z makietą (`SCOPES`). */
const SCOPE_TABS: readonly { view: MainView; label: string }[] = [
  { view: "active", label: "Aktywne" },
  { view: "done", label: "Zakończone" },
  { view: "cancelled", label: "Anulowane" },
  { view: "trash", label: "Kosz" },
];

/** Trzy pozycje podfiltra rodziny „active" (Wszystko aktywne / Nowe / W toku) z kanonicznych opcji. */
const ACTIVE_SUBFILTERS = STATE_FILTER_OPTIONS.filter((option) => option.view === "active");

export default function StateFilterSelect({ view, type, opstatus, onSelectActiveSubfilter }: Props) {
  const selectedSubfilter = stateSelectValue(view, opstatus);

  return (
    <div className="flex flex-col gap-3">
      {/* Zakładki zakresu — pełna nawigacja; aktywna wg bieżącego `view`. */}
      <nav className="border-border flex gap-0.5 border-b" aria-label="Zakres wpisów">
        {SCOPE_TABS.map((tab) => {
          const active = tab.view === view;
          return (
            <a
              key={tab.view}
              href={navigateHref(tab.view, type, undefined)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2.5 text-[13.5px] font-medium transition-colors",
                active
                  ? "border-foreground text-foreground"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {tab.label}
            </a>
          );
        })}
      </nav>

      {/* Podfiltr rodziny „active" — kliencki re-fetch (tylko na widoku Aktywne). */}
      {view === "active" && onSelectActiveSubfilter && (
        <div className="flex items-center gap-2" role="group" aria-label="Stan aktywnych">
          <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Stan</span>
          <div className="border-border bg-muted inline-flex items-center gap-0.5 rounded-[6px] border p-[3px]">
            {ACTIVE_SUBFILTERS.map((option) => {
              const active = option.value === selectedSubfilter;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    onSelectActiveSubfilter(option.opstatus);
                  }}
                  className={cn(
                    "rounded-[3px] px-2.5 py-1 text-[12px] font-medium transition-colors",
                    active ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
