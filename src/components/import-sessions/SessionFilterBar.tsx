// Pasek filtrów dziennika sesji importu (S-11): motywowane kontrolki sortu i statusu zamiast natywnych
// `<select>` + przycisku „Zastosuj". KONTROLOWANE — rodzic (wyspa) trzyma `SessionListCriteria`, każda zmiana
// idzie przez jeden `onChange` (rodzic czyści zaznaczenie i re-fetchuje przez hook). Pole to shadcn `Select`
// (istniejący `radix-ui`, bez nowej zależności), wizualnie spójne z `SortControl` z list głównych.

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { importSessionStatusLabel } from "@/lib/labels";
import type { SessionListCriteria, SessionSort, SessionStatusFilter } from "@/lib/services/session-list-criteria";
import type { ImportSessionStatus } from "@/types";

interface Props {
  criteria: SessionListCriteria;
  /** Każda zmiana kryterium z paska. Rodzic czyści zaznaczenie i woła `setCriteria` (re-fetch). */
  onChange: (next: SessionListCriteria) => void;
}

const SORT_OPTIONS: { value: SessionSort; label: string }[] = [
  { value: "created_desc", label: "Najnowsze" },
  { value: "created_asc", label: "Najstarsze" },
];

const STATUS_VALUES: ImportSessionStatus[] = ["processing", "completed_with_items", "completed_no_items", "failed"];

// Wspólne klasy triggera — pigułka cosmic spójna z `SortControl` (białe półprzezroczyste tło, hover jaśniejszy).
const TRIGGER = "w-[168px] rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10";

export default function SessionFilterBar({ criteria, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtry dziennika sesji">
      <Select
        value={criteria.sort}
        onValueChange={(next) => {
          onChange({ ...criteria, sort: next as SessionSort });
        }}
      >
        <SelectTrigger size="sm" aria-label="Sortowanie" className={TRIGGER}>
          {/* Etykieta jawnie jako dziecko: Radix wyprowadza tekst wybranej opcji z elementów portalu,
              których SSR nie renderuje — pusty trigger „wskakiwałby" po hydracji (mignięcie). */}
          <SelectValue>{SORT_OPTIONS.find((opt) => opt.value === criteria.sort)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={criteria.status}
        onValueChange={(next) => {
          onChange({ ...criteria, status: next as SessionStatusFilter });
        }}
      >
        <SelectTrigger size="sm" aria-label="Status" className={TRIGGER}>
          <SelectValue>
            {criteria.status === "all" ? "Wszystkie" : importSessionStatusLabel(criteria.status)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Wszystkie</SelectItem>
          {STATUS_VALUES.map((status) => (
            <SelectItem key={status} value={status}>
              {importSessionStatusLabel(status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
