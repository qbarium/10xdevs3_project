import SortControl from "@/components/items/SortControl";
import TypeFilter from "@/components/items/TypeFilter";
import { Button } from "@/components/ui/button";
import type { ListCriteria } from "@/lib/services/list-criteria";

interface Props {
  criteria: ListCriteria;
  /** Każda zmiana kryterium z toolbara. Rodzic (wyspa) czyści zaznaczenie i woła `setCriteria` (re-fetch). */
  onChange: (next: ListCriteria) => void;
  /** Komunikat błędu fetcha z hooka lub `null`. Lista zostaje (hook ją zachowuje); baner tylko informuje. */
  error: string | null;
  /** Ponów ostatnie pobranie wg bieżących kryteriów (re-fetch tych samych `criteria`). */
  onRetry: () => void;
  /**
   * Tryb sesji (S-13 F4): toolbar UKRYTY (tryb nie oferuje filtrowania). Zostaje wyłącznie odnośnik
   * „Wyczyść filtry" wykonujący PEŁNĄ nawigację na `/items` (wyjście z trybu wymaga renderu serwerowego)
   * oraz baner błędu z „Ponów" (fetch trybu też może polec).
   */
  disabled?: boolean;
}

/** Baner błędu fetcha z akcją „Ponów" — wspólny dla obu wariantów toolbara (pełnego i trybu sesji). */
function ErrorBanner({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="border-destructive/40 bg-destructive/10 text-destructive flex items-center gap-3 rounded-[5px] border px-3 py-2 text-sm"
    >
      <span className="flex-1">{error}</span>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        Ponów
      </Button>
    </div>
  );
}

// Toolbar filtrów dodatkowych (S-09 Faza 5; S-15 Faza 3): segmentowy filtr typu (po lewej) + sort (po prawej).
// Oś stanu strony „Wpisy" (płaski rząd zakładek stanu) obsługuje osobny `StateFilterSelect` nad
// toolbarem; szukajka i akcja główna żyją w topbarze powłoki. Kontrolki KONTROLOWANE przez `criteria`; każda
// zmiana idzie przez jeden `onChange` (rodzic czyści zaznaczenie i re-fetchuje). Bez wskaźnika ładowania (dane
// małe/lokalne; swap listy jest płynny) — zostaje baner błędu z „Ponów" zsynchronizowany ze stanem hooka.
export default function ListFilterBar({ criteria, onChange, error, onRetry, disabled = false }: Props) {
  // Tryb sesji: bez kontrolek — tylko wyjście z trybu + baner błędu.
  if (disabled) {
    return (
      <div className="flex flex-col gap-2">
        <div>
          <Button asChild size="sm" variant="outline">
            <a href="/items">Wyczyść filtry</a>
          </Button>
        </div>
        <ErrorBanner error={error} onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <TypeFilter
          value={criteria.type}
          onChange={(type) => {
            onChange({ ...criteria, type });
          }}
        />
        <div className="ml-auto">
          <SortControl
            value={{ sort: criteria.sort, dir: criteria.dir }}
            onChange={({ sort, dir }) => {
              onChange({ ...criteria, sort, dir });
            }}
          />
        </div>
      </div>

      <ErrorBanner error={error} onRetry={onRetry} />
    </div>
  );
}
