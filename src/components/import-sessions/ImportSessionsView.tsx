// Wyspa-rodzic master-detail (S-10): hoisting granicy wyspy z SessionsList do wspólnego rodzica, by lewa
// lista sesji i prawy panel jej elementów dzieliły jeden stan (`selectedSessionId`). Strona .astro montuje
// JĄ (client:load) zamiast bezpośrednio SessionsList. Lewa kolumna: dotychczasowa lista (z wyborem i
// podświetleniem). Prawa: panel elementów wybranej sesji (fetch na wybór). Layout: jedna kolumna na mobile,
// dwie od md w górę; prawy panel „przykleja się" przy przewijaniu długiej listy.

import { useState } from "react";

import SessionItemsPanel from "@/components/import-sessions/SessionItemsPanel";
import { SessionsList } from "@/components/import-sessions/SessionsList";
import type { SessionRowData } from "@/components/import-sessions/SessionRow";

export default function ImportSessionsView({ rows }: { rows: SessionRowData[] }) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="min-w-0">
        <SessionsList
          rows={rows}
          selectedId={selectedSessionId}
          onSelect={(id) => {
            setSelectedSessionId(id);
          }}
        />
      </div>
      <div className="min-w-0 md:sticky md:top-4 md:self-start">
        <SessionItemsPanel sessionId={selectedSessionId} />
      </div>
    </div>
  );
}
