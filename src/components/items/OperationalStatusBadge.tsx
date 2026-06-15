import { ChevronDownIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OPERATIONAL_TRANSITIONS } from "@/lib/items/operational-transitions";
import { operationalStatusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Item, OperationalStatus } from "@/types";

interface Props {
  item: Item;
  disabled?: boolean;
  onChange: (target: OperationalStatus) => void;
}

const BADGE_CLASS =
  "inline-flex items-center gap-1 rounded-full border border-blue-300/30 bg-blue-400/10 px-2 py-0.5 text-xs font-medium text-blue-100 transition hover:bg-blue-400/20 disabled:cursor-not-allowed disabled:opacity-50";

// Klikalny badge stanu operacyjnego: pokazuje bieżący stan (etykieta per-typ) i otwiera menu
// kontekstowe z kuracją przejść (OPERATIONAL_TRANSITIONS). Klik pozycji → onChange(target). Gdy
// `disabled` (żądanie w locie) — trigger nieaktywny. Kuracja (UX) ≠ walidacja (dane dopuszczają 4 stany).
export default function OperationalStatusBadge({ item, disabled = false, onChange }: Props) {
  const status = item.operational_status;

  // Brak stanu (teoretyczne — po backfillu nie występuje) → statyczny badge bez menu.
  if (!status) {
    return <span className={cn(BADGE_CLASS, "cursor-default")}>{operationalStatusLabel("new", item.type)}</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        disabled={disabled}
        className={BADGE_CLASS}
        aria-label={`Zmień stan: ${item.title}`}
      >
        {operationalStatusLabel(status, item.type)}
        <ChevronDownIcon className="size-3 opacity-70" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {OPERATIONAL_TRANSITIONS[status].map((transition) => (
          <DropdownMenuItem
            key={transition.target}
            onSelect={() => {
              onChange(transition.target);
            }}
          >
            {transition.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
