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
  /** Brak `onChange` → badge tylko do odczytu (lista; zmiana stanu odbywa się w dialogu edycji). */
  onChange?: (target: OperationalStatus) => void;
}

const BADGE_BASE =
  "inline-flex items-center gap-1 rounded-full border border-blue-300/30 bg-blue-400/10 px-2 py-0.5 text-xs font-medium text-blue-100";
const BADGE_INTERACTIVE = "transition hover:bg-blue-400/20 disabled:cursor-not-allowed disabled:opacity-50";

// Badge stanu operacyjnego. Z `onChange` jest KLIKALNY: pokazuje bieżący stan (etykieta per-typ) i
// otwiera menu z kuracją przejść (OPERATIONAL_TRANSITIONS) → onChange(target). BEZ `onChange` (lub bez
// stanu) jest STATYCZNY (tylko etykieta) — używany na liście, gdzie edycję stanu przejęła formatka.
// Kuracja (UX) ≠ walidacja (dane dopuszczają 4 stany).
export default function OperationalStatusBadge({ item, disabled = false, onChange }: Props) {
  const status = item.operational_status;

  // Tryb tylko-do-odczytu: brak callbacku zmiany albo brak stanu (teoretyczne — po backfillu nie występuje).
  if (!onChange || !status) {
    return (
      <span className={cn(BADGE_BASE, "cursor-default")}>{operationalStatusLabel(status ?? "new", item.type)}</span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        disabled={disabled}
        className={cn(BADGE_BASE, BADGE_INTERACTIVE)}
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
