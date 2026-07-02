import { TYPE_FILTER_VALUES, type TypeFilterValue } from "@/components/items/type-filter";
import { Button } from "@/components/ui/button";
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

// Prezentacyjny rząd przycisków filtra typu (single-select, kontrolowany — bez własnego stanu).
// Pełne pigułki, aktywna podświetlona na fioletowo (wspólny motyw pigułek nawigacji). Rodzic
// trzyma `value` i reaguje na `onChange`. `aria-pressed` niesie stan zaznaczenia do czytników ekranu.
export default function TypeFilter({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtr typu">
      {TYPE_FILTER_VALUES.map((option) => {
        const active = option === value;
        return (
          <Button
            key={option}
            type="button"
            size="sm"
            variant="outline"
            aria-pressed={active}
            onClick={() => {
              onChange(option);
            }}
            className={cn(
              "rounded-full",
              active
                ? "border-purple-300/40 bg-purple-400/20 text-white hover:bg-purple-400/30"
                : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
            )}
          >
            {filterLabel(option)}
          </Button>
        );
      })}
    </div>
  );
}
