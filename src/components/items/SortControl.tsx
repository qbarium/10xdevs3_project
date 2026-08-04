import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SortDir, SortField } from "@/lib/services/list-criteria";
import { cn } from "@/lib/utils";

interface Props {
  value: { sort: SortField; dir: SortDir };
  onChange: (value: { sort: SortField; dir: SortDir }) => void;
}

// Etykiety pól sortowania (jedno naraz). Kolejność = kolejność w menu.
const SORT_FIELDS: { value: SortField; label: string }[] = [
  { value: "title", label: "Tytuł" },
  { value: "created", label: "Data utworzenia" },
  { value: "updated", label: "Data modyfikacji" },
];

// Kontrolka sortowania (S-09 Faza 5): single-select pole + przełącznik kierunku. KONTROLOWANA — rodzic
// trzyma `{ sort, dir }` w `ListCriteria`, kontrolka nie ma własnego stanu trwałego. Pole to shadcn `Select`
// (istniejący `radix-ui`, bez nowej zależności); kierunek to toggle z etykietą tekstową (strzałka Unicode +
// `aria-label` — niezależne od nazw ikon `lucide-react`). Szata „techniczna" (S-15 Faza 3): tokeny, ostre rogi.
export default function SortControl({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Sortowanie">
      <Select
        value={value.sort}
        onValueChange={(next) => {
          onChange({ sort: next as SortField, dir: value.dir });
        }}
      >
        <SelectTrigger size="sm" aria-label="Pole sortowania" className="w-[176px] rounded-[5px]">
          {/* Etykieta jawnie jako dziecko: Radix wyprowadza tekst wybranej opcji z elementów portalu,
              których SSR nie renderuje — pusty trigger „wskakiwałby" po hydracji (mignięcie). */}
          <SelectValue>{SORT_FIELDS.find((field) => field.value === value.sort)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SORT_FIELDS.map((field) => (
            <SelectItem key={field.value} value={field.value}>
              {field.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={
          value.dir === "asc" ? "Kierunek: rosnąco — przełącz na malejąco" : "Kierunek: malejąco — przełącz na rosnąco"
        }
        onClick={() => {
          onChange({ sort: value.sort, dir: value.dir === "asc" ? "desc" : "asc" });
        }}
        className={cn("rounded-[5px] font-mono")}
      >
        {value.dir === "asc" ? "↑ rosnąco" : "↓ malejąco"}
      </Button>
    </div>
  );
}
