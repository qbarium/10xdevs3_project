import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (q: string) => void;
  className?: string;
}

// Pole wyszukiwania (S-09 Faza 5; S-15 Faza 3 → topbar powłoki). KONTROLOWANE bezpośrednio przez `value`
// (= `criteria.q`): topbar aktualizuje je SYNCHRONICZNIE, a debounce SIECIOWY (~300 ms) realizuje hook
// `useItemList` w wyspie listy (nie to pole). Świadomie bez osobnego `useState` — bezpośrednie wiązanie jest
// tak samo płynne, a przy tym odporne na „Wyczyść filtry" i back/forward (oba zmieniają `value`, pole
// natychmiast to odbija). Ikona lupy + przycisk ✕ czyści frazę. Kolory z tokenów (oba motywy).
export default function SearchBox({ value, onChange, className }: Props) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={value}
        placeholder="Szukaj w tytule i opisie…"
        aria-label="Szukaj w tytule i opisie"
        onChange={(event) => {
          onChange(event.target.value);
        }}
        // Natywny przycisk czyszczenia `type="search"` (× w WebKit/Chrome) dublował nasz własny przycisk
        // „Wyczyść wyszukiwanie" — ukryty globalnie w `global.css` (::-webkit-search-cancel-button).
        className="h-9 rounded-[5px] pr-8 pl-8"
      />
      {value !== "" && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Wyczyść wyszukiwanie"
          onClick={() => {
            onChange("");
          }}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 size-7 -translate-y-1/2 rounded-[4px] p-0"
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
