// Lista dziennika sesji importu (S-08; od S-13 F5 jedna kolumna pełnoszerokich KART nawigacyjnych —
// aparat wyboru/listbox z S-10 zdemontowany razem z panelem). Renderuje karty, które aktualizują swój
// status w miejscu po ponowieniu (patrz SessionCard). Dane przychodzą jako odchudzone DTO (bez pełnego
// raw_input). S-11: sort/filtr/strona są reaktywne — lista jest własnością hooka `useSessionList` w rodzicu
// (ImportSessionsView), a ten komponent jest czysto prezentacyjny (karty + dwa rozróżnione pusty-stany).

import { SessionCard } from "@/components/import-sessions/SessionCard";
import type { SessionRowData } from "@/components/import-sessions/SessionCard";

export function SessionsList({
  rows,
  hasActiveFilters,
  onClearFilters,
}: {
  rows: SessionRowData[];
  /** Czy aktywny filtr/sort odbiega od domyślnego — rozróżnia dwa pusty-stany (S-11). */
  hasActiveFilters: boolean;
  /** Reset kryteriów do domyślnych (akcja „Wyczyść filtry" w pustym wyniku z filtrem). */
  onClearFilters: () => void;
}) {
  if (rows.length === 0) {
    // Pusto Z aktywnym filtrem → komunikat „dla wybranych filtrów" + akcja wyczyszczenia; pusto BEZ filtra
    // → dotychczasowy komunikat „brak sesji importu" (dziennik jest po prostu pusty).
    return hasActiveFilters ? (
      <div
        role="status"
        className="border-border bg-card text-muted-foreground flex flex-col items-center gap-3 rounded-[5px] border px-4 py-6 text-center text-sm"
      >
        Brak sesji dla wybranych filtrów.
        <button
          type="button"
          onClick={onClearFilters}
          className="border-border text-foreground hover:bg-accent hover:text-accent-foreground rounded-[5px] border px-3 py-1.5 text-sm font-medium transition-colors"
        >
          Wyczyść filtry
        </button>
      </div>
    ) : (
      <div
        role="status"
        className="border-border bg-card text-muted-foreground rounded-[5px] border px-4 py-6 text-center text-sm"
      >
        Brak sesji importu. Zaimportuj wsad, aby zobaczyć je tutaj.
      </div>
    );
  }

  return (
    // gap-3 jak między kartami wpisów — jednolity rytm list w całej aplikacji.
    <ul aria-label="Lista sesji importu" className="flex flex-col gap-3">
      {rows.map((row) => (
        <SessionCard key={row.id} row={row} />
      ))}
    </ul>
  );
}
