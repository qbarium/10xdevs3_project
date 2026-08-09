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
      <div className="flex min-h-0 flex-1 flex-col">
        {/* NIERUCHOMY pasek: filtry sesji i baner błędu — poza obszarem przewijania; przewija się WYŁĄCZNIE lista. */}
        <div className="flex shrink-0 flex-col gap-3 px-6 pt-6 pb-3">
          {/* Zmiana filtra/sortu zawsze wraca na stronę 1 (zakres wyników się zmienia) — resetToFirstPage. */}
          <div className="flex flex-wrap items-center gap-2">
            <SessionFilterBar
              criteria={criteria}
              onChange={(next) => {
                setCriteria(resetToFirstPage(next));
              }}
            />
            {loading && (
              <Loader2 className="text-muted-foreground size-4 animate-spin" aria-label="Aktualizowanie listy" />
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive flex items-center gap-3 rounded-[5px] border px-3 py-2 text-sm"
            >
              <span className="flex-1">{error}</span>
              <Button type="button" size="sm" variant="outline" onClick={retry}>
                Ponów
              </Button>
            </div>
          )}
        </div>

        {/* Lista — JEDYNY obszar przewijania (scroll ograniczony do listy; treść przycięta do jej ramki). */}
        <div className="scrollbar-stable min-h-0 flex-1 overflow-y-auto px-6">
          <SessionsList
            rows={rows}
            hasActiveFilters={hasActiveSessionFilters(settledCriteria)}
            onClearFilters={() => {
              // Czyść filtry/sort, ale ZACHOWAJ rozmiar strony — to preferencja widoku, nie filtr.
              setCriteria({ ...defaultSessionCriteria(), size: criteria.size });
            }}
          />
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-6 pt-3 pb-6">
          <PageSizeSelect
            value={criteria.size}
            sizes={SESSION_PAGE_SIZES}
            ariaLabel="Liczba wpisów na stronę"
            onChange={(size) => {
              // Zmiana rozmiaru = nowy zakres → reset do strony 1; wybór zapamiętany w cookie (czyta też SSR).
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
