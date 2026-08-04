import { TYPE_FILTER_VALUES, type TypeFilterValue } from "@/components/items/type-filter";
import { itemTypeLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

interface Props {
  value: TypeFilterValue;
  onChange: (value: TypeFilterValue) => void;
}

/** Etykieta przycisku: „Wszystkie" dla `all`, w innym wypadku polska etykieta typu z `ITEM_TYPE_LABELS`. */
function filterLabel(value: TypeFilterValue): string {
  return value === "all" ? "Wszystkie" : itemTypeLabel(value);
}

// Segmentowy filtr typu (S-15 Faza 3, wzorzec `.segmented` z makiety): kontrolki złączone w jednym pojemniku
// na tokenach, aktywna wyróżniona podniesionym tłem. Single-select, kontrolowany (bez własnego stanu) —
// rodzic trzyma `value` i reaguje na `onChange`. `aria-pressed` niesie stan zaznaczenia do czytników ekranu.
export default function TypeFilter({ value, onChange }: Props) {
  return (
    <div
      className="border-border bg-muted inline-flex flex-wrap items-center gap-0.5 rounded-[6px] border p-[3px]"
      role="group"
      aria-label="Filtr typu"
    >
      {TYPE_FILTER_VALUES.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => {
              onChange(option);
            }}
            className={cn(
              "rounded-[3px] px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
              active
                ? "bg-background text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {filterLabel(option)}
          </button>
        );
      })}
    </div>
  );
}
