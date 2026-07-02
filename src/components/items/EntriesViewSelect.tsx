// Lista rozwijana widoku strony „Wpisy" (decyzja użytkownika 2026-07-02 — zastępuje zakładki
// MainFilterNav): cztery widoki wpisów, BEZ „Do akceptacji", które jest osobną pozycją menu górnego.
// Widok to tożsamość ŚCIEŻKI strony (list-criteria), więc wybór wykonuje PEŁNĄ nawigację na stronę
// widoku (świeży render SSR, domyślne kryteria — jak dotychczasowe zakładki), nie klienckie
// przełączenie. Etykieta jawnie w SelectValue (SSR bez mignięcia — wzorzec SessionFilterBar).

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Widoki dostępne na stronie „Wpisy" (pending ma własną stronę „Do akceptacji"). */
const ENTRY_VIEWS = [
  { value: "active", label: "Aktywne", href: "/items/active" },
  { value: "done", label: "Zakończone", href: "/items/done" },
  { value: "cancelled", label: "Anulowane", href: "/items/cancelled" },
  { value: "trash", label: "Kosz", href: "/items/trash" },
] as const;

export type EntryView = (typeof ENTRY_VIEWS)[number]["value"];

export default function EntriesViewSelect({ view }: { view: EntryView }) {
  return (
    <Select
      value={view}
      onValueChange={(next) => {
        const target = ENTRY_VIEWS.find((entry) => entry.value === next);
        if (target && target.value !== view) window.location.assign(target.href);
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label="Widok wpisów"
        className="w-[136px] rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
      >
        <SelectValue>{ENTRY_VIEWS.find((entry) => entry.value === view)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ENTRY_VIEWS.map((entry) => (
          <SelectItem key={entry.value} value={entry.value}>
            {entry.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
