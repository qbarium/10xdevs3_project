// Lista dziennika sesji importu (S-08; listbox z wyborem z S-10). Renderuje wiersze, które aktualizują swój
// status w miejscu po ponowieniu (patrz SessionRow). Dane przychodzą jako odchudzone DTO (bez pełnego
// raw_input). S-11: sort/filtr/strona są reaktywne — lista jest własnością hooka `useSessionList` w rodzicu
// (ImportSessionsView), a ten komponent jest czysto prezentacyjny (wiersze + dwa rozróżnione pusty-stany).
//
// S-10: lista to ARIA listbox z nawigacją klawiaturą. Cały wiersz (`role="option"`) jest klikalny; ↑/↓
// przesuwają zaznaczenie i fokus, Enter/Spacja zaznaczają wiersz pod fokusem. Roving tabindex: jeden punkt
// wejścia z Tab (wybrany wiersz, a gdy nic nie wybrano — pierwszy). Logika klawiatury siedzi TU, bo zna
// pełną listę wierszy; wiersz tylko deleguje zdarzenie.

import type { KeyboardEvent } from "react";

import { SessionRow } from "@/components/import-sessions/SessionRow";
import type { SessionRowData } from "@/components/import-sessions/SessionRow";

export function SessionsList({
  rows,
  onSelect,
  selectedId,
  hasActiveFilters,
  onClearFilters,
}: {
  rows: SessionRowData[];
  onSelect: (id: string) => void;
  selectedId: string | null;
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
        className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/70"
      >
        Brak sesji dla wybranych filtrów.
        <button
          type="button"
          onClick={onClearFilters}
          className="rounded-lg border border-purple-300/30 bg-purple-400/10 px-3 py-1.5 text-sm font-medium text-purple-100 transition-colors hover:bg-purple-400/20"
        >
          Wyczyść filtry
        </button>
      </div>
    ) : (
      <div
        role="status"
        className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/70"
      >
        Brak sesji importu. Zaimportuj wsad, aby zobaczyć je tutaj.
      </div>
    );
  }

  const selectedIndex = rows.findIndex((row) => row.id === selectedId);

  function handleRowKeyDown(event: KeyboardEvent<HTMLLIElement>): void {
    const { key } = event;
    const currentIndex = Number(event.currentTarget.dataset.rowIndex);
    if (key === "ArrowDown" || key === "ArrowUp") {
      // ↑/↓ przesuwają zaznaczenie (panel po prawej śledzi) i fokus na sąsiedni wiersz.
      event.preventDefault();
      const nextIndex =
        key === "ArrowDown" ? Math.min(currentIndex + 1, rows.length - 1) : Math.max(currentIndex - 1, 0);
      onSelect(rows[nextIndex].id);
      event.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-row-index="${nextIndex}"]`)?.focus();
    } else if (key === "Enter" || key === " ") {
      // Enter/Spacja zaznaczają wiersz pod fokusem — ale tylko gdy fokus jest na samym wierszu, a nie na
      // przycisku retry w jego środku (wtedy zdarzenie obsługuje przycisk).
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      onSelect(rows[currentIndex].id);
    }
  }

  return (
    <ul
      role="listbox"
      aria-label="Lista sesji importu"
      className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl"
    >
      {rows.map((row, index) => (
        <SessionRow
          key={row.id}
          row={row}
          rowIndex={index}
          selected={row.id === selectedId}
          tabIndex={row.id === selectedId || (selectedIndex < 0 && index === 0) ? 0 : -1}
          onSelect={onSelect}
          onKeyDown={handleRowKeyDown}
        />
      ))}
    </ul>
  );
}
