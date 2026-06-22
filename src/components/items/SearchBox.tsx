import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (q: string) => void;
  className?: string;
}

// Pole wyszukiwania (S-09 Faza 5). KONTROLOWANE bezpośrednio przez `value` (= `criteria.q`): rodzic
// aktualizuje je SYNCHRONICZNIE w `setCriteria`, a debounce SIECIOWY (~300 ms) realizuje hook `useItemList`
// (nie to pole). Świadomie bez osobnego `useState` — bezpośrednie wiązanie jest tak samo płynne, a przy tym
// odporne na „Wyczyść filtry" i back/forward (oba zmieniają `criteria.q`, pole natychmiast to odbija);
// mirror w stanie lokalnym wymagałby efektu synchronizującego (anti-pattern). Przycisk ✕ czyści frazę.
export default function SearchBox({ value, onChange, className }: Props) {
  return (
    <div className={cn("relative min-w-0 flex-1 basis-56", className)}>
      <Input
        type="search"
        value={value}
        placeholder="Szukaj w tytule i opisie…"
        aria-label="Szukaj w tytule i opisie"
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="rounded-full border-white/10 bg-white/5 pr-9 text-white/90 placeholder:text-white/40"
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
          className="absolute top-1/2 right-1 size-7 -translate-y-1/2 rounded-full p-0 text-white/60 hover:bg-white/10 hover:text-white"
        >
          ✕
        </Button>
      )}
    </div>
  );
}
