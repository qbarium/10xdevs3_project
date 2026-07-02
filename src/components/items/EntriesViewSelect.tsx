// Lista rozwijana widoku strony „Wpisy" (decyzja użytkownika 2026-07-02 — zastępuje zakładki
// MainFilterNav): cztery widoki wpisów, BEZ „Do akceptacji", które jest osobną pozycją menu górnego.
// Widok to tożsamość ŚCIEŻKI strony (list-criteria), więc wybór wykonuje PEŁNĄ nawigację na stronę
// widoku (świeży render SSR), nie klienckie przełączenie. Wybrany RODZAJ itemu przenosi się do adresu
// docelowego (`?type=`) — zmiana widoku nie resetuje filtra rodzaju (decyzja użytkownika 2026-07-02);
// pozostałe kryteria (sort/fraza/strona) wracają do domyślnych widoku, jak przy dawnych zakładkach.
// Etykieta jawnie w SelectValue (SSR bez mignięcia — wzorzec SessionFilterBar).

import type { TypeFilterValue } from "@/components/items/type-filter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Widoki dostępne na stronie „Wpisy" (pending ma własną stronę „Do akceptacji"). */
const ENTRY_VIEWS = [
  { value: "active", label: "Aktywne", href: "/items/active" },
  { value: "done", label: "Zakończone", href: "/items/done" },
  { value: "cancelled", label: "Anulowane", href: "/items/cancelled" },
  { value: "trash", label: "Kosz", href: "/items/trash" },
] as const;

export type EntryView = (typeof ENTRY_VIEWS)[number]["value"];

interface Props {
  view: EntryView;
  /** Aktywny filtr rodzaju itemu (żywe kryteria wyspy) — przenoszony do adresu docelowego widoku. */
  type: TypeFilterValue;
}

export default function EntriesViewSelect({ view, type }: Props) {
  return (
    <Select
      value={view}
      onValueChange={(next) => {
        const target = ENTRY_VIEWS.find((entry) => entry.value === next);
        if (target && target.value !== view) {
          window.location.assign(type === "all" ? target.href : `${target.href}?type=${type}`);
        }
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
