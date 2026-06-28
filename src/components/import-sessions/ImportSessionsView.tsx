// Wyspa-rodzic master-detail (S-10) + reaktywne filtry/sort (S-11). Hoisting granicy wyspy z SessionsList do
// wspólnego rodzica, by lewa lista sesji i prawy panel jej elementów dzieliły jeden stan (`selectedSessionId`).
// S-11: rodzic jest też JEDYNYM właścicielem listy przez hook `useSessionList` (kryteria ↔ adres, re-fetch
// z `GET /api/import-sessions`), a strona .astro przekazuje TYLKO stan początkowy (rows/criteria/total z SSR).
// Pasek filtrów (`SessionFilterBar`) siedzi nad gridem; zmiana filtra/sortu czyści zaznaczenie i re-fetchuje.

import { useCallback, useState } from "react";

import SessionFilterBar from "@/components/import-sessions/SessionFilterBar";
import SessionItemsPanel from "@/components/import-sessions/SessionItemsPanel";
import { SessionsList } from "@/components/import-sessions/SessionsList";
import type { SessionRowData } from "@/components/import-sessions/SessionRow";
import { useSessionList } from "@/components/hooks/useSessionList";
import { Toaster } from "@/components/ui/sonner";
import { defaultSessionCriteria, hasActiveSessionFilters } from "@/lib/services/session-list-criteria";
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
  const { rows, criteria, settledCriteria, setCriteria } = useSessionList(initialRows, initialCriteria, initialTotal);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Zmiana kryteriów = nowa lista z serwera → zaznaczenie poprzedniej sesji traci sens (może jej nie być na
  // nowej liście). Czyścimy je przy każdej zmianie filtra/sortu, zanim hook re-fetchuje.
  const changeCriteria = useCallback(
    (next: SessionListCriteria) => {
      setSelectedSessionId(null);
      setCriteria(next);
    },
    [setCriteria],
  );

  return (
    // Jeden <Toaster/> dla całej wyspy (poza przepływem kolumn, by nie spychać treści panelu w dół).
    <>
      <Toaster />
      <div className="flex flex-col gap-4">
        <SessionFilterBar criteria={criteria} onChange={changeCriteria} />
        {/* `items-start` trzyma obie kolumny przy górze (nagłówki na jednym poziomie), a prawy panel może się
            „przykleić" przy przewijaniu długiej listy. Każda kolumna: nagłówek (równa wysokość) + zawartość. */}
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-start">
          <section className="flex min-w-0 flex-col gap-3">
            <h2 className={COLUMN_HEADING}>Sesje</h2>
            <SessionsList
              rows={rows}
              selectedId={selectedSessionId}
              onSelect={(id) => {
                setSelectedSessionId(id);
              }}
              hasActiveFilters={hasActiveSessionFilters(settledCriteria)}
              onClearFilters={() => {
                changeCriteria(defaultSessionCriteria());
              }}
            />
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
