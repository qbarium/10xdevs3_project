import type { ReactNode } from "react";

import OperationalSubFilter from "@/components/items/OperationalSubFilter";
import SearchBox from "@/components/items/SearchBox";
import SortControl from "@/components/items/SortControl";
import TypeFilter from "@/components/items/TypeFilter";
import { Button } from "@/components/ui/button";
import type { ListCriteria } from "@/lib/services/list-criteria";

interface Props {
  criteria: ListCriteria;
  /** Każda zmiana kryterium z paska. Rodzic (wyspa) czyści zaznaczenie i woła `setCriteria` (re-fetch). */
  onChange: (next: ListCriteria) => void;
  /** Komunikat błędu fetcha z hooka lub `null`. Lista zostaje (hook ją zachowuje); baner tylko informuje. */
  error: string | null;
  /** Ponów ostatnie pobranie wg bieżących kryteriów (re-fetch tych samych `criteria`). */
  onRetry: () => void;
  /** Slot na akcje swoiste dla widoku (np. „Wyczyść kosz" w Koszu). */
  children?: ReactNode;
  /** Slot PRZED filtrem typu w pierwszym rzędzie — przełącznik widoku strony „Wpisy" (EntriesViewSelect). */
  leading?: ReactNode;
  /**
   * Tryb sesji (S-13 F4): kontrolki filtrów UKRYTE (tryb nie oferuje filtrowania; wariant wyszarzony
   * zajmował pół ekranu — decyzja użytkownika po testach manualnych 2026-07-02). Zostaje wyłącznie
   * odnośnik „Wyczyść filtry" wykonujący PEŁNĄ nawigację na `/items` (wyjście z trybu wymaga ponownego
   * renderu serwerowego — zakładki wracają do życia) oraz baner błędu z „Ponów" (fetch trybu też może polec).
   */
  disabled?: boolean;
}

/** Baner błędu fetcha z akcją „Ponów" — wspólny dla obu wariantów paska (pełnego i trybu sesji). */
function ErrorBanner({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100"
    >
      <span className="flex-1">{error}</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onRetry}
        className="border-red-300/40 bg-red-400/10 text-red-50 hover:bg-red-400/20"
      >
        Ponów
      </Button>
    </div>
  );
}

// Wspólny pasek filtrów dodatkowych (S-09 Faza 5): typ + sort + szukaj (+ podfiltr stanu w „Aktywne").
// Wszystkie kontrolki KONTROLOWANE przez `criteria`; każda zmiana idzie przez jeden `onChange` (rodzic czyści
// zaznaczenie i re-fetchuje). Podfiltr operacyjny renderowany wyłącznie dla `view==="active"` (jedyny widok
// z >1 stanem). Bez wskaźnika ładowania (dane małe/lokalne — migający tekst szkodził; swap listy jest płynny);
// zostaje baner błędu z „Ponów" zsynchronizowany ze stanem hooka.
export default function ListFilterBar({
  criteria,
  onChange,
  error,
  onRetry,
  children,
  leading,
  disabled = false,
}: Props) {
  // Tryb sesji: bez kontrolek — tylko wyjście z trybu + baner błędu.
  if (disabled) {
    return (
      <div className="flex flex-col gap-2">
        <div>
          <a
            href="/items"
            className="inline-block rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            Wyczyść filtry
          </a>
        </div>
        <ErrorBanner error={error} onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Rząd kategorii: przełącznik widoku (strona „Wpisy") + pigułki filtra typu + podfiltr stanu (Aktywne). */}
      <div className="flex flex-wrap items-center gap-2">
        {leading}
        <TypeFilter
          value={criteria.type}
          onChange={(type) => {
            onChange({ ...criteria, type });
          }}
        />
        {criteria.view === "active" && (
          <OperationalSubFilter
            value={criteria.opstatus}
            onChange={(opstatus) => {
              onChange({ ...criteria, opstatus });
            }}
          />
        )}
      </div>

      {/* Rząd sort + szukaj + akcje widoku + wskaźnik ładowania. */}
      <div className="flex flex-wrap items-center gap-2">
        <SortControl
          value={{ sort: criteria.sort, dir: criteria.dir }}
          onChange={({ sort, dir }) => {
            onChange({ ...criteria, sort, dir });
          }}
        />
        <SearchBox
          value={criteria.q}
          onChange={(q) => {
            onChange({ ...criteria, q });
          }}
        />
        {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
      </div>

      <ErrorBanner error={error} onRetry={onRetry} />
    </div>
  );
}
