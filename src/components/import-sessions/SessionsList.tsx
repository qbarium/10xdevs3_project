// Lista dziennika sesji importu (S-08). Jedna wyspa React (montowana przez import-sessions.astro jako
// client:load) — renderuje wiersze, które aktualizują swój status w miejscu po ponowieniu (patrz
// SessionRow). Dane przychodzą jako odchudzone DTO liczone serwerowo (bez pełnego raw_input). Sort/filtr
// pozostają server-side (formularz GET na stronie) — to jedyna ścieżka usuwania wierszy z listy.

import { SessionRow } from "@/components/import-sessions/SessionRow";
import type { SessionRowData } from "@/components/import-sessions/SessionRow";

export function SessionsList({
  rows,
  onSelect,
  selectedId,
}: {
  rows: SessionRowData[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  if (rows.length === 0) {
    return (
      <div
        role="status"
        className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/70"
      >
        Brak sesji importu. Zaimportuj wsad, aby zobaczyć je tutaj.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <SessionRow key={row.id} row={row} onSelect={onSelect} selected={row.id === selectedId} />
      ))}
    </ul>
  );
}
