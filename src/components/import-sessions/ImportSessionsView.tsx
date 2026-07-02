// Wyspa-rodzic master-detail (S-10) + reaktywne filtry/sort/paginacja (S-11). Hoisting granicy wyspy z
// SessionsList do wspólnego rodzica, by lewa lista sesji i prawy panel jej elementów dzieliły jeden stan
// (`selectedSessionId`). S-11: rodzic jest też JEDYNYM właścicielem listy przez hook `useSessionList`
// (kryteria ↔ adres, re-fetch z `GET /api/import-sessions`), a strona .astro przekazuje TYLKO stan początkowy.
// Pasek filtrów nad gridem; pod listą kontrolki stron. Zmiana filtra/sortu czyści zaznaczenie, wraca na
// stronę 1 i re-fetchuje; zmiana strony zachowuje filtr/sort. Wskaźnik ładowania i baner błędu z ponowieniem
// (poprzednia lista zostaje, więc widok nie pustoszeje przy błędzie pobrania).

import { Loader2 } from "lucide-react";
import { useCallback, useState } from "react";

import { useSessionList } from "@/components/hooks/useSessionList";
import SessionFilterBar from "@/components/import-sessions/SessionFilterBar";
import SessionItemsPanel from "@/components/import-sessions/SessionItemsPanel";
import type { SessionRowData } from "@/components/import-sessions/SessionRow";
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

// Wspólny styl nagłówka kolumny — oba (lewy „Sesje", prawy „Elementy sesji") identyczne, by stały na tym
// samym poziomie, a zawartość pod nimi startowała równo.
const COLUMN_HEADING =
  "bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-lg font-semibold text-transparent";

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
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Zmiana kryteriów = nowa lista z serwera → zaznaczenie poprzedniej sesji traci sens (może jej nie być na
  // nowej liście). Czyścimy je przy każdej zmianie filtra/sortu/strony, zanim hook re-fetchuje.
  const changeCriteria = useCallback(
    (next: SessionListCriteria) => {
      setSelectedSessionId(null);
      setCriteria(next);
    },
    [setCriteria],
  );

  // Ponowienie po błędzie pobrania: re-fetch bieżących (żywych) kryteriów; poprzednia lista zostaje do skutku.
  const retry = useCallback(() => {
    setCriteria(criteria);
  }, [setCriteria, criteria]);

  return (
    // Jeden <Toaster/> dla całej wyspy (poza przepływem kolumn, by nie spychać treści panelu w dół).
    <>
      <Toaster />
      <div className="flex flex-col gap-4">
        {/* Zmiana filtra/sortu zawsze wraca na stronę 1 (zakres wyników się zmienia) — resetToFirstPage. */}
        <SessionFilterBar
          criteria={criteria}
          onChange={(next) => {
            changeCriteria(resetToFirstPage(next));
          }}
        />

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

        {/* `items-start` trzyma obie kolumny przy górze (nagłówki na jednym poziomie), a prawy panel może się
            „przykleić" przy przewijaniu długiej listy. Każda kolumna: nagłówek (równa wysokość) + zawartość. */}
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-start">
          <section className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center gap-2">
              <h2 className={COLUMN_HEADING}>Sesje</h2>
              {loading && <Loader2 className="size-4 animate-spin text-white/50" aria-label="Aktualizowanie listy" />}
            </div>
            <SessionsList
              rows={rows}
              selectedId={selectedSessionId}
              onSelect={(id) => {
                setSelectedSessionId(id);
              }}
              hasActiveFilters={hasActiveSessionFilters(settledCriteria)}
              onClearFilters={() => {
                // Czyść filtry/sort, ale ZACHOWAJ rozmiar strony — to preferencja widoku, nie filtr.
                changeCriteria({ ...defaultSessionCriteria(), size: criteria.size });
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
                  changeCriteria(resetToFirstPage({ ...criteria, size }));
                }}
              />
              <Pagination
                page={page}
                pageCount={pageCount}
                ariaLabel="Paginacja sesji"
                onPage={(nextPage) => {
                  // Paginacja zachowuje filtr/sort z wyświetlanej listy (settledCriteria), zmienia samą stronę.
                  changeCriteria({ ...settledCriteria, page: nextPage });
                }}
              />
            </div>
          </section>
          <section className="flex min-w-0 flex-col gap-3 md:sticky md:top-4">
            <h2 className={COLUMN_HEADING}>Elementy sesji</h2>
            <SessionItemsPanel sessionId={selectedSessionId} />
          </section>
        </div>
      </div>
    </>
  );
}
