// Wyspa dziennika sesji: reaktywne filtry/sort/paginacja (S-11). Od S-13 F5 dziennik to JEDNA kolumna
// pełnoszerokich kart nawigacyjnych — master-detail z S-10 (dwukolumnowy grid, panel elementów, stan
// wyboru `selectedSessionId`) zdemontowany; wpisy sesji żyją w trybie sesji `/items?session=<id>`
// (odnośnik „Pokaż wpisy" na karcie). Wyspa jest JEDYNYM właścicielem listy przez hook `useSessionList`
// (kryteria ↔ adres, re-fetch z `GET /api/import-sessions`), a strona .astro przekazuje TYLKO stan
// początkowy. Pasek filtrów nad listą; pod listą kontrolki stron. Zmiana filtra/sortu wraca na stronę 1
// i re-fetchuje; zmiana strony zachowuje filtr/sort. Wskaźnik ładowania i baner błędu z ponowieniem
// (poprzednia lista zostaje, więc widok nie pustoszeje przy błędzie pobrania).

import { Loader2 } from "lucide-react";
import { useCallback } from "react";

import { useSessionList } from "@/components/hooks/useSessionList";
import type { SessionRowData } from "@/components/import-sessions/SessionCard";
import SessionFilterBar from "@/components/import-sessions/SessionFilterBar";
import { SessionsList } from "@/components/import-sessions/SessionsList";
import { SESSION_LOG_PAGE_SIZE_KEY, writePageSizePref } from "@/components/lists/page-size-pref";
import PageSizeSelect from "@/components/lists/PageSizeSelect";
import Pagination from "@/components/lists/Pagination";
import { resetToFirstPage } from "@/components/lists/list-pagination";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  defaultSessionCriteria,
  hasActiveSessionFilters,
  SESSION_PAGE_SIZES,
} from "@/lib/services/session-list-criteria";
import type { SessionListCriteria } from "@/lib/services/session-list-criteria";

export default function ImportSessionsView({
  initialRows,
  initialCriteria,
  initialTotal,
}: {
  initialRows: SessionRowData[];
  initialCriteria: SessionListCriteria;
  initialTotal: number;
}) {
  const { rows, criteria, settledCriteria, setCriteria, loading, error, page, pageCount } = useSessionList(
    initialRows,
    initialCriteria,
    initialTotal,
  );

  // Ponowienie po błędzie pobrania: re-fetch bieżących (żywych) kryteriów; poprzednia lista zostaje do skutku.
  const retry = useCallback(() => {
    setCriteria(criteria);
  }, [setCriteria, criteria]);

  return (
    <>
      <Toaster />
      <div className="flex flex-col gap-4">
        {/* Zmiana filtra/sortu zawsze wraca na stronę 1 (zakres wyników się zmienia) — resetToFirstPage. */}
        <div className="flex flex-wrap items-center gap-2">
          <SessionFilterBar
            criteria={criteria}
            onChange={(next) => {
              setCriteria(resetToFirstPage(next));
            }}
          />
          {loading && <Loader2 className="size-4 animate-spin text-white/50" aria-label="Aktualizowanie listy" />}
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
              onClick={retry}
              className="border-red-300/40 bg-red-400/10 text-red-50 hover:bg-red-400/20"
            >
              Ponów
            </Button>
          </div>
        )}

        <SessionsList
          rows={rows}
          hasActiveFilters={hasActiveSessionFilters(settledCriteria)}
          onClearFilters={() => {
            // Czyść filtry/sort, ale ZACHOWAJ rozmiar strony — to preferencja widoku, nie filtr.
            setCriteria({ ...defaultSessionCriteria(), size: criteria.size });
          }}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <PageSizeSelect
            value={criteria.size}
            sizes={SESSION_PAGE_SIZES}
            ariaLabel="Liczba wpisów na stronę"
            onChange={(size) => {
              // Zmiana rozmiaru = nowy zakres → reset do strony 1; zapamiętujemy wybór w localStorage.
              writePageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SESSION_PAGE_SIZES, size);
              setCriteria(resetToFirstPage({ ...criteria, size }));
            }}
          />
          <Pagination
            page={page}
            pageCount={pageCount}
            ariaLabel="Paginacja sesji"
            onPage={(nextPage) => {
              // Paginacja zachowuje filtr/sort z wyświetlanej listy (settledCriteria), zmienia samą stronę.
              setCriteria({ ...settledCriteria, page: nextPage });
            }}
          />
        </div>
      </div>
    </>
  );
}
