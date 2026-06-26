// Pojedynczy wiersz dziennika sesji importu (S-08; układ grid + wybór z S-10). Komponent React, by status
// mógł zmieniać się W MIEJSCU po ponowieniu — bez przeładowania strony i bez znikania wiersza z listy. Po
// rozstrzygnięciu ponowienia (stan `done`) wiersz bierze nowy status/itemCount/code z wyniku i przerysowuje
// sam siebie. Błąd ŻĄDANIA (`error`) NIE zmienia statusu sesji → wiersz pozostaje `failed`, a pod linią
// główną pojawia się komunikat + przycisk „Spróbuj ponownie" (retry, jedyny element interaktywny w środku).
//
// S-10: wiersz to jeden, w pełni klikalny `role="option"` w liście-listboxie — klik gdziekolwiek zaznacza
// sesję, a nawigacja strzałkami ↑/↓ jest delegowana do SessionsList (zna pełną listę). Kolumny linii głównej
// (Typ · Data · Podgląd+wpisy · Status) mają stałe tracki, więc wyrównują się między wierszami (efekt grida).

import { Loader2 } from "lucide-react";
import type { KeyboardEvent } from "react";

import { useSessionRetry } from "@/components/hooks/useSessionRetry";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ingestErrorMessage } from "@/lib/ingest-errors";
import { entryNoun, importSessionStatusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ImportSessionStatus } from "@/types";

/** Odchudzone dane wiersza (liczone serwerowo) — bez pełnego `raw_input`, tylko gotowy podgląd. */
export interface SessionRowData {
  id: string;
  isFile: boolean;
  preview: string;
  dateLabel: string;
  status: ImportSessionStatus;
  /** Historyczna liczba elementów z chwili klasyfikacji (nie maleje przy usuwaniu). */
  itemCount: number | null;
  /** Liczba ŻYWYCH elementów (po ewentualnym trwałym usunięciu). `live < itemCount` → „X z Y wpisów". */
  liveItemCount: number;
  errorCode: string | null;
}

/** Kolor badge'a statusu (tailwind) — wizualne rozróżnienie stanów przebiegu. */
const STATUS_BADGE: Record<ImportSessionStatus, string> = {
  processing: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  completed_with_items: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  completed_no_items: "border-white/15 bg-white/10 text-white/70",
  failed: "border-red-300/30 bg-red-400/10 text-red-100",
};

interface Props {
  row: SessionRowData;
  selected: boolean;
  /** Roving tabindex: 0 dla punktu wejścia listy (wybrany lub pierwszy wiersz), -1 dla pozostałych. */
  tabIndex: number;
  /** Indeks wiersza — kotwica `data-row-index` do programowego fokusu przy nawigacji strzałkami. */
  rowIndex: number;
  onSelect: (id: string) => void;
  /** Klawiatura listy (↑/↓/Enter/Spacja) — delegowana do SessionsList, która zna pełną listę wierszy. */
  onKeyDown: (event: KeyboardEvent<HTMLLIElement>) => void;
}

export function SessionRow({ row, selected, tabIndex, rowIndex, onSelect, onKeyDown }: Props) {
  const { state, result, error, retry } = useSessionRetry();

  // Po rozstrzygnięciu ponowienia (done) nadpisujemy widok wyniku w miejscu; inaczej zostaje stan z SSR.
  const resolved = state === "done" && result ? result : null;
  const status: ImportSessionStatus = resolved ? resolved.status : row.status;
  const itemCount = resolved ? resolved.itemCount : (row.itemCount ?? 0);
  // Po ponowieniu żywych == nowy item_count (świeża klasyfikacja, nic jeszcze nie usunięto); inaczej z SSR.
  const liveItemCount = resolved ? itemCount : row.liveItemCount;
  const errorCode = resolved ? resolved.code : row.errorCode;
  const isRetrying = state === "retrying";

  // Kolumna „wpisy": liczba dla stanów zakończonych (processing/failed → „—"). Gdy część elementów trwale
  // usunięto („Wyczyść kosz"), żywych jest mniej niż w chwili klasyfikacji → „X z Y wpisów"; inaczej „Y wpisów".
  let countText: string;
  if (status === "completed_with_items" || status === "completed_no_items") {
    // „X z Y" → dopełniacz po „z N" (1 → „wpisu", ≥2 → „wpisów"), NIE forma licząca `entryNoun`
    // („1 wpis"/„2 wpisy") — ta jest poprawna tylko dla samodzielnego „N wpisów".
    countText =
      liveItemCount < itemCount
        ? `${liveItemCount} z ${itemCount} ${itemCount === 1 ? "wpisu" : "wpisów"}`
        : `${itemCount} ${entryNoun(itemCount)}`;
  } else {
    countText = "—";
  }

  return (
    <li
      role="option"
      aria-selected={selected}
      tabIndex={tabIndex}
      data-row-index={rowIndex}
      onClick={() => {
        onSelect(row.id);
      }}
      onKeyDown={onKeyDown}
      className={cn(
        "cursor-pointer px-4 py-2.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50 focus-visible:ring-inset",
        selected ? "bg-purple-500/15" : "hover:bg-white/5",
      )}
    >
      {/* Linia główna — stałe, krótkie kolumny (Typ · Data · Wpisy · Status) wyrównują się między wierszami,
          niezależnie od liczby plików (brak treści zmiennej długości). Bez podglądu i nazw plików — elementy
          sesji są po prawej; podgląd/nazwę dorobimy w razie potrzeby (pole `preview` zostaje w DTO). */}
      <div className="grid grid-cols-[4.5rem_9rem_1fr_8rem] items-center gap-3">
        <span className="justify-self-start rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-center text-xs font-medium text-white/70">
          {row.isFile ? "Plik" : "Tekst"}
        </span>
        <time className="text-sm whitespace-nowrap text-white/90">{row.dateLabel}</time>
        <span className="justify-self-center text-xs whitespace-nowrap text-white/60">{countText}</span>
        <span
          className={cn(
            "justify-self-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
            STATUS_BADGE[status],
          )}
        >
          {importSessionStatusLabel(status)}
        </span>
      </div>

      {/* Tylko `failed`: komunikat + retry. `stopPropagation`, by klik/Enter na przycisku nie zaznaczał wiersza. */}
      {status === "failed" && (
        <div className="mt-2 flex flex-col gap-2 text-sm">
          <p className="text-red-200/90">{ingestErrorMessage(errorCode)}</p>
          {state === "error" && (
            <Alert variant="destructive">
              <AlertDescription>{error ?? ingestErrorMessage(result?.code ?? null)}</AlertDescription>
            </Alert>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isRetrying}
            onClick={(event) => {
              event.stopPropagation();
              void retry(row.id);
            }}
            className="w-fit"
          >
            {isRetrying ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Ponawianie…
              </>
            ) : (
              "Spróbuj ponownie"
            )}
          </Button>
        </div>
      )}
    </li>
  );
}
