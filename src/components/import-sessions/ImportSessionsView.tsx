// Wyspa-rodzic master-detail (S-10): hoisting granicy wyspy z SessionsList do wspólnego rodzica, by lewa
// lista sesji i prawy panel jej elementów dzieliły jeden stan (`selectedSessionId`). Strona .astro montuje
// JĄ (client:load) zamiast bezpośrednio SessionsList. Lewa kolumna: dotychczasowa lista (z wyborem i
// podświetleniem). Prawa: panel elementów wybranej sesji (fetch na wybór). Layout: jedna kolumna na mobile,
// dwie od md w górę; prawy panel „przykleja się" przy przewijaniu długiej listy.

import { useState } from "react";

import SessionItemsPanel from "@/components/import-sessions/SessionItemsPanel";
import { SessionsList } from "@/components/import-sessions/SessionsList";
import type { SessionRowData } from "@/components/import-sessions/SessionRow";
import { Toaster } from "@/components/ui/sonner";

// Wspólny styl nagłówka kolumny — oba (lewy „Sesje", prawy „Elementy sesji") identyczne, by stały na tym
// samym poziomie, a zawartość pod nimi startowała równo.
const COLUMN_HEADING =
  "bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-lg font-semibold text-transparent";

export default function ImportSessionsView({ rows }: { rows: SessionRowData[] }) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  return (
    // Jeden <Toaster/> dla całej wyspy (poza przepływem kolumn, by nie spychać treści panelu w dół).
    // `items-start` trzyma obie kolumny przy górze (nagłówki na jednym poziomie), a prawy panel może się
    // „przykleić" przy przewijaniu długiej listy. Każda kolumna: nagłówek (równa wysokość) + zawartość.
    <>
      <Toaster />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-start">
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className={COLUMN_HEADING}>Sesje</h2>
          <SessionsList
            rows={rows}
            selectedId={selectedSessionId}
            onSelect={(id) => {
              setSelectedSessionId(id);
            }}
          />
        </section>
        <section className="flex min-w-0 flex-col gap-3 md:sticky md:top-4">
          <h2 className={COLUMN_HEADING}>Elementy sesji</h2>
          <SessionItemsPanel sessionId={selectedSessionId} />
        </section>
      </div>
    </>
  );
}
