import { useRef, useState } from "react";
import { toast } from "sonner";

import { useItemMutation } from "@/components/hooks/useItemMutation";
import {
  allIds,
  isAllSelected,
  removeByIds,
  requiresConfirmation,
  toggleSelection,
} from "@/components/items/selection";
import TypeFilter from "@/components/items/TypeFilter";
import { applyTypeFilter, TYPE_FILTER_COOKIE, type TypeFilterValue } from "@/components/items/type-filter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { acceptanceOriginLabel, itemTypeLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Item } from "@/types";

interface Props {
  initialItems: Item[];
  /** Filtr typu z cookie (czytany SERWEROWO) — stan początkowy islandu, by SSR renderował od razu poprawnie. */
  initialTypeFilter: TypeFilterValue;
}

// Brak koncepcji „przypiętych" w koszu (item nieedytowalny) — applyTypeFilter wymaga zbioru, podajemy pusty.
const NO_PINNED: ReadonlySet<string> = new Set();

// Checkbox wyraźnie widoczny na ciemnym tle „cosmic" (jak AcceptedItemsView).
const CHECKBOX_CLASS =
  "size-5 border-white/40 data-[state=checked]:border-purple-400 data-[state=checked]:bg-purple-500 data-[state=checked]:text-white data-[state=indeterminate]:border-purple-400 data-[state=indeterminate]:bg-purple-500 data-[state=indeterminate]:text-white";

/** Polska odmiana rzeczownika „element" wg liczby (lokalne, jak w AcceptedItemsView — bez sprzęgania islandów). */
function elementNoun(n: number): string {
  if (n === 1) return "element";
  const tens = n % 100;
  const units = n % 10;
  if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) return "elementy";
  return "elementów";
}

// Interaktywny island Kosza (S-06). Reużywa wzorce AcceptedItemsView: model zaznaczania (selection.ts) +
// pessimistic dim + Dialog confirm na select-all + toast + filtr typu przez wspólny cookie SSR. Pochodzenie
// itemu (rejected/deleted) niesie badge na karcie — w trybie Kosz zawężamy WYŁĄCZNIE po typie (jak inne
// widoki), bez osobnego filtra statusu (decyzja właścicielska 2026-06-19). Restore usuwa item z listy
// bezwarunkowo (opuszcza kosz w obu kierunkach: deleted→accepted, rejected→pending). „Wyczyść kosz" to
// globalny twardy DELETE z obowiązkowym potwierdzeniem podającym ŁĄCZNĄ liczbę itemów kosza.
export default function TrashItemsView({ initialItems, initialTypeFilter }: Props) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<TypeFilterValue>(initialTypeFilter);
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set());
  // Potwierdzenie restore (select-all): id do przywrócenia po akceptacji. Potwierdzenie empty: boolean.
  const [confirmRestore, setConfirmRestore] = useState<string[] | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  // Synchroniczny zamek re-entry (jak AcceptedItemsView): stan aktualizuje się po re-renderze, ref od razu.
  const inFlightRef = useRef(false);
  const { restoreFromTrash, emptyTrash, pending } = useItemMutation();

  // Lista renderowana = itemy zawężone filtrem typu (jedyny filtr w Koszu). Zaznaczanie i licznik operują
  // na WIDOCZNYCH itemach; invariant „selected ⊆ widoczne" utrzymuje czyszczenie selekcji przy zmianie filtra.
  const visibleItems = applyTypeFilter(items, typeFilter, NO_PINNED);
  const allSelected = isAllSelected(selected.size, visibleItems.length);
  const selectedCount = selected.size;

  function toggleItem(id: string): void {
    setSelected((prev) => toggleSelection(prev, id));
  }

  function toggleAll(): void {
    setSelected((prev) => (isAllSelected(prev.size, visibleItems.length) ? new Set() : allIds(visibleItems)));
  }

  // Pessimistic: itemy w locie są WYGASZANE (dim); usunięcie z listy następuje dopiero po sukcesie serwera.
  async function executeRestore(ids: string[]): Promise<void> {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setInFlightIds(new Set(ids));
    const count = await restoreFromTrash(ids);
    if (count === null) {
      toast.error("Nie udało się przywrócić. Spróbuj ponownie.");
      setInFlightIds(new Set());
      inFlightRef.current = false;
      return;
    }
    // Sukces: item opuszcza kosz bezwarunkowo (deleted→accepted ORAZ rejected→pending — w obu wraca poza Kosz).
    const idSet = new Set(ids);
    setItems((prev) => removeByIds(prev, idSet));
    setSelected((prev) => {
      if (!ids.some((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      idSet.forEach((id) => next.delete(id));
      return next;
    });
    // Licznik z serwera = liczba FAKTYCZNIE przywróconych (guard statusem pomija nie-uprawnione).
    if (count > 0) {
      toast.success(`Przywrócono ${count} ${elementNoun(count)}.`);
    } else {
      toast("Wybrane elementy były już nieaktualne — lista odświeżona.");
    }
    setInFlightIds(new Set());
    inFlightRef.current = false;
  }

  // Bulk restore: potwierdzenie tylko gdy zaznaczono WSZYSTKIE widoczne (gest „zaznacz wszystkie").
  function requestRestore(): void {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (requiresConfirmation(ids.length, visibleItems.length)) {
      setConfirmRestore(ids);
    } else {
      void executeRestore(ids);
    }
  }

  function confirmRestoreProceed(): void {
    if (!confirmRestore) return;
    const ids = confirmRestore;
    setConfirmRestore(null);
    void executeRestore(ids);
  }

  // „Wyczyść kosz": globalny twardy DELETE. Po potwierdzeniu kasuje CAŁY kosz (rejected + deleted, ponad
  // filtrami) — stan islandu czyścimy do pustej listy, bo serwer skasował wszystkie wiersze usera.
  async function executeEmpty(): Promise<void> {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const count = await emptyTrash();
    if (count === null) {
      toast.error("Nie udało się opróżnić kosza. Spróbuj ponownie.");
      inFlightRef.current = false;
      return;
    }
    setItems([]);
    setSelected(new Set());
    toast.success(`Kosz opróżniony — trwale usunięto ${count} ${elementNoun(count)}.`);
    inFlightRef.current = false;
  }

  function confirmEmptyProceed(): void {
    setConfirmEmpty(false);
    void executeEmpty();
  }

  // Zmiana filtra typu: wyczyść selekcję (invariant selected ⊆ widoczne) + zapisz wspólny cookie SSR
  // (mirror AcceptedItemsView.handleFilterChange) — serwer odczyta go przy każdym SSR i wyrenderuje od
  // razu poprawnie przefiltrowaną listę. `Secure` tylko po HTTPS (na http-dev cookie Secure nie wróciłby).
  function handleTypeFilterChange(next: TypeFilterValue): void {
    setTypeFilter(next);
    setSelected(new Set());
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${TYPE_FILTER_COOKIE}=${next}; path=/; SameSite=Lax${secure}`;
  }

  return (
    <div className="flex flex-col gap-3">
      <Toaster />

      {items.length === 0 ? (
        <div
          role="status"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/70"
        >
          Kosz jest pusty.
        </div>
      ) : (
        <>
          {/* Filtr typu (jedyny filtr w Koszu) + globalny „Wyczyść kosz" (zawsze dostępny, gdy kosz niepusty). */}
          <div className="flex flex-wrap items-center gap-2">
            <TypeFilter value={typeFilter} onChange={handleTypeFilterChange} />
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setConfirmEmpty(true);
              }}
              className="ml-auto"
            >
              Wyczyść kosz
            </Button>
          </div>

          {visibleItems.length === 0 ? (
            <div
              role="status"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/70"
            >
              Brak elementów tego typu w koszu.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <label className="flex items-center gap-2 text-sm text-white/80">
                  <Checkbox
                    checked={allSelected ? true : selectedCount > 0 ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                    aria-label="Zaznacz wszystkie"
                    className={CHECKBOX_CLASS}
                  />
                  Zaznacz wszystkie
                </label>
                <span className="text-sm text-white/50">
                  {selectedCount > 0
                    ? `Zaznaczono: ${selectedCount}`
                    : `${visibleItems.length} ${elementNoun(visibleItems.length)}`}
                </span>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selectedCount === 0 || pending}
                    onClick={requestRestore}
                  >
                    Przywróć zaznaczone
                  </Button>
                </div>
              </div>

              {visibleItems.map((item) => (
                <article
                  key={item.id}
                  className={cn(
                    "flex gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl transition-opacity",
                    inFlightIds.has(item.id) && "pointer-events-none opacity-50",
                  )}
                >
                  <Checkbox
                    checked={selected.has(item.id)}
                    onCheckedChange={() => {
                      toggleItem(item.id);
                    }}
                    aria-label={`Zaznacz: ${item.title}`}
                    className={cn("mt-1", CHECKBOX_CLASS)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-block rounded-full border border-purple-300/30 bg-purple-400/10 px-2 py-0.5 text-xs font-medium text-purple-100">
                        {itemTypeLabel(item.type)}
                      </span>
                      {/* Item w koszu ma zawsze status rejected|deleted (gwarancja zapytania getTrashItems). */}
                      <span className="inline-block rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs font-medium text-white/70">
                        {acceptanceOriginLabel(item.acceptance_status as "rejected" | "deleted")}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto text-white/60 hover:bg-white/10 hover:text-white"
                        disabled={pending}
                        onClick={() => {
                          void executeRestore([item.id]);
                        }}
                      >
                        Przywróć
                      </Button>
                    </div>
                    <h3 className="mt-2 font-semibold text-white/90">{item.title}</h3>
                    {item.description && <p className="mt-1 line-clamp-2 text-sm text-white/70">{item.description}</p>}
                  </div>
                </article>
              ))}
            </>
          )}
        </>
      )}

      {/* Potwierdzenie bulk restore (select-all). */}
      <Dialog
        open={confirmRestore !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRestore(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmRestore ? `Przywrócić ${confirmRestore.length} ${elementNoun(confirmRestore.length)}?` : ""}
            </DialogTitle>
            <DialogDescription>
              Akcja obejmuje wszystkie wyświetlane elementy. Czy na pewno chcesz kontynuować?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmRestore(null);
              }}
            >
              Anuluj
            </Button>
            <Button onClick={confirmRestoreProceed}>Przywróć</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Potwierdzenie „Wyczyść kosz" — łączna liczba CAŁEGO kosza (items.length), ponad filtrami. */}
      <Dialog
        open={confirmEmpty}
        onOpenChange={(open) => {
          if (!open) setConfirmEmpty(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{`Wyczyścić kosz? Trwale usuniesz ${items.length} ${elementNoun(items.length)}.`}</DialogTitle>
            <DialogDescription>
              Akcja jest nieodwracalna i obejmuje CAŁY kosz (odrzucone i usunięte), niezależnie od aktywnych filtrów.
              Tej operacji nie można cofnąć.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmEmpty(false);
              }}
            >
              Anuluj
            </Button>
            <Button variant="destructive" onClick={confirmEmptyProceed}>
              Wyczyść kosz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
