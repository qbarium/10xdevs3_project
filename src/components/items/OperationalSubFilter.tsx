import { Button } from "@/components/ui/button";
import { operationalStatusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { OperationalStatus } from "@/types";

interface Props {
  /** `undefined` = „Wszystkie" (bez zawężania stanu). */
  value: OperationalStatus | undefined;
  onChange: (value: OperationalStatus | undefined) => void;
}

// Podfiltr stanu operacyjnego — TYLKO widok „Aktywne" (jedyny z >1 stanem: `new` + `in_progress`; pozostałe
// widoki mają po jednym stanie lub go nie filtrują). Pigułki single-select spójne z `TypeFilter`; „Wszystkie"
// (undefined) znaczy brak zawężania. Etykiety z kanonicznego `operationalStatusLabel` (spójne z badge'ami listy).
const OPTIONS: { value: OperationalStatus | undefined; label: string }[] = [
  { value: undefined, label: "Wszystkie" },
  { value: "new", label: operationalStatusLabel("new") },
  { value: "in_progress", label: operationalStatusLabel("in_progress") },
];

export default function OperationalSubFilter({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtr stanu">
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <Button
            key={option.value ?? "all"}
            type="button"
            size="sm"
            variant="outline"
            aria-pressed={active}
            onClick={() => {
              onChange(option.value);
            }}
            className={cn(
              "rounded-full",
              active
                ? "border-purple-300/40 bg-purple-400/20 text-white hover:bg-purple-400/30"
                : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
            )}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
