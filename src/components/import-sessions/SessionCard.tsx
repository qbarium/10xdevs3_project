// Karta sesji w dzienniku (S-13 F5; wcześniej wiersz-listbox `SessionRow` z S-08/S-10). Komponent React,
// by status mógł zmieniać się W MIEJSCU po ponowieniu — bez przeładowania strony i bez znikania karty
// z listy. Po rozstrzygnięciu ponowienia (stan `done`) karta bierze nowy status/itemCount/code z wyniku
// i przerysowuje samą siebie — naprawiona sesja od razu pokazuje „Pokaż wpisy". Błąd ŻĄDANIA (`error`)
// NIE zmienia statusu sesji → karta pozostaje `failed` z komunikatem i przyciskiem „Ponów".
//
// Karta jest NAWIGACYJNA, nie zaznaczalna (master-detail zdemontowany w S-13): klikalne są WYŁĄCZNIE
// akcje — „Pokaż wpisy" (odnośnik do trybu sesji `/items?session=<id>`; tylko gdy sesja ma żywe wpisy)
// i „Ponów" (failed). Aparat wyboru (role="option", aria-selected, roving tabindex, klik na całej
// powierzchni) usunięty razem z panelem.

import { Loader2 } from "lucide-react";

import { useSessionRetry } from "@/components/hooks/useSessionRetry";
import { rememberSessionLogReturn } from "@/components/import-sessions/session-log-return";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ingestErrorMessage } from "@/lib/ingest-errors";
import { entryNoun, importSessionStatusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ImportSessionStatus } from "@/types";

/** Odchudzone dane karty (liczone serwerowo) — bez pełnego `raw_input`, tylko gotowy podgląd. */
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

/** Kolor badge'a statusu (tailwind) — wizualne rozróżnienie stanów przebiegu; współdzielone z SessionBanner. */
export const STATUS_BADGE: Record<ImportSessionStatus, string> = {
  processing: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  completed_with_items: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  completed_no_items: "border-white/15 bg-white/10 text-white/70",
  failed: "border-red-300/30 bg-red-400/10 text-red-100",
};

interface Props {
  row: SessionRowData;
}

export function SessionCard({ row }: Props) {
  const { state, result, error, retry } = useSessionRetry();

  // Po rozstrzygnięciu ponowienia (done) nadpisujemy widok wyniku w miejscu; inaczej zostaje stan z SSR.
  const resolved = state === "done" && result ? result : null;
  const status: ImportSessionStatus = resolved ? resolved.status : row.status;
  const itemCount = resolved ? resolved.itemCount : (row.itemCount ?? 0);
  // Po ponowieniu żywych == nowy item_count (świeża klasyfikacja, nic jeszcze nie usunięto); inaczej z SSR.
  const liveItemCount = resolved ? itemCount : row.liveItemCount;
  const errorCode = resolved ? resolved.code : row.errorCode;
  const isRetrying = state === "retrying";

  // Licznik wpisów: liczba dla stanów zakończonych (processing/failed → „—"). Gdy część elementów trwale
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

  // „Pokaż wpisy" wyłącznie dla ROZSTRZYGNIĘTEGO (po ewentualnym ponowieniu) statusu z żywymi wpisami —
  // `processing`/`completed_no_items`/wyczyszczone do zera nie mają dokąd prowadzić.
  const showEntriesLink = status === "completed_with_items" && liveItemCount > 0;

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-center text-xs font-medium text-white/70">
          {row.isFile ? "Plik" : "Tekst"}
        </span>
        <time className="text-sm whitespace-nowrap text-white/90">{row.dateLabel}</time>
        <span className="text-xs whitespace-nowrap text-white/60">{countText}</span>
        <span
          className={cn(
            "ml-auto rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
            STATUS_BADGE[status],
          )}
        >
          {importSessionStatusLabel(status)}
        </span>
      </div>

      {/* Źródło (nazwa pliku albo skrót paste — gotowe pole `preview`) i „Pokaż wpisy" w JEDNYM wierszu
          (link po prawej): karty z akcją i bez niej mają RÓWNĄ wysokość. Klik zapamiętuje query dziennika,
          by „Wróć do dziennika" w trybie sesji prowadziło na tę samą stronę/filtr. */}
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-sm text-white/80">{row.preview}</p>
        {showEntriesLink && (
          <a
            href={`/items?session=${row.id}`}
            onClick={rememberSessionLogReturn}
            className="shrink-0 rounded-full border border-purple-300/30 bg-purple-400/10 px-3 py-1.5 text-sm font-medium text-purple-100 transition hover:bg-purple-400/20"
          >
            Pokaż wpisy
          </a>
        )}
      </div>

      {/* Tylko `failed`: komunikat + „Ponów" (po sukcesie karta w miejscu pokaże nowy status i „Pokaż wpisy"). */}
      {status === "failed" && (
        <div className="flex flex-col gap-2 text-sm">
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
            onClick={() => {
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
              "Ponów"
            )}
          </Button>
        </div>
      )}
    </li>
  );
}
