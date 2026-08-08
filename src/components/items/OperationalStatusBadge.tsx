import { CheckIcon, ChevronDownIcon } from "lucide-react";

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

// Szata „techniczna" (S-15 Faza 3, wzorzec `.state` z makiety): ostry badge z kropką/haczykiem i kolorem
// per stan z tokenów (`--prog-fg`/`--done-fg`, oba motywy). „W toku" niebieski, „Zakończone" zielony z
// haczykiem, „Nowe"/„Anulowane" wyciszone. Zero zaszytych kolorów.
const BADGE_BASE =
  "inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 text-[11.5px] leading-none font-medium";

const STATE_TONE: Record<OperationalStatus, string> = {
  new: "border-border text-muted-foreground",
  in_progress: "border-prog-fg/35 text-prog-fg",
  done: "border-done-fg/40 text-done-fg",
  cancelled: "border-border text-muted-foreground",
};

/** Kropka stanu (kolor dziedziczony z tekstu) lub haczyk dla „Zakończone". */
function StateMark({ status }: { status: OperationalStatus }) {
  if (status === "done") return <CheckIcon className="size-3" aria-hidden="true" />;
  return <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />;
}

// Badge stanu operacyjnego. Z `onChange` jest KLIKALNY: pokazuje bieżący stan (etykieta per-typ) i
// otwiera menu z kuracją przejść (OPERATIONAL_TRANSITIONS) → onChange(target). BEZ `onChange` (lub bez
// stanu) jest STATYCZNY (tylko etykieta) — używany na liście, gdzie edycję stanu przejęła formatka.
// Kuracja (UX) ≠ walidacja (dane dopuszczają 4 stany).
export default function OperationalStatusBadge({ item, disabled = false, onChange }: Props) {
  const status = item.operational_status;

  // Tryb tylko-do-odczytu: brak callbacku zmiany albo brak stanu (teoretyczne — po backfillu nie występuje).
  if (!onChange || !status) {
    const effective = status ?? "new";
    return (
      <span className={cn(BADGE_BASE, STATE_TONE[effective], "cursor-default")}>
        <StateMark status={effective} />
        {operationalStatusLabel(effective, item.type)}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        disabled={disabled}
        className={cn(
          BADGE_BASE,
          STATE_TONE[status],
          "transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50",
        )}
        aria-label={`Zmień stan: ${item.title}`}
      >
        <StateMark status={status} />
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
