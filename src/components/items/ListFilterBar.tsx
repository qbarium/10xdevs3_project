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
}

// Wspólny pasek filtrów dodatkowych (S-09 Faza 5): typ + sort + szukaj (+ podfiltr stanu w „Aktywne").
// Wszystkie kontrolki KONTROLOWANE przez `criteria`; każda zmiana idzie przez jeden `onChange` (rodzic czyści
// zaznaczenie i re-fetchuje). Podfiltr operacyjny renderowany wyłącznie dla `view==="active"` (jedyny widok
// z >1 stanem). Bez wskaźnika ładowania (dane małe/lokalne — migający tekst szkodził; swap listy jest płynny);
// zostaje baner błędu z „Ponów" zsynchronizowany ze stanem hooka.
export default function ListFilterBar({ criteria, onChange, error, onRetry, children }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {/* Rząd kategorii (pigułki): filtr typu + podfiltr stanu (tylko Aktywne). */}
      <div className="flex flex-wrap items-center gap-2">
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

      {error && (
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
      )}
    </div>
  );
}
