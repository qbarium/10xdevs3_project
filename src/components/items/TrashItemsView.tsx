import { useRef, useState } from "react";
import { toast } from "sonner";

import { useItemList } from "@/components/hooks/useItemList";
import { useItemMutation } from "@/components/hooks/useItemMutation";
import ListFilterBar from "@/components/items/ListFilterBar";
import {
  allIds,
  isAllSelected,
  removeByIds,
  requiresConfirmation,
  toggleSelection,
} from "@/components/items/selection";
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
import { defaultCriteria, hasActiveFilters } from "@/lib/services/list-criteria";
import type { ListCriteria } from "@/lib/services/list-criteria";
import { cn } from "@/lib/utils";
import type { Item } from "@/types";

interface Props {
  initialItems: Item[];
  /** Kryteria z adresu strony (czytane SERWEROWO tym samym parserem co klient) — stan startowy hooka, by SSR
      i pierwszy render wyspy były identyczne (hydration-stable, bez przeskoku). */
  initialCriteria: ListCriteria;
}

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
// pessimistic dim + Dialog confirm na select-all + toast + filtr typu. Pochodzenie itemu (rejected/deleted)
// niesie badge na karcie — w trybie Kosz zawężamy WYŁĄCZNIE po typie (jak inne widoki), bez osobnego filtra
// statusu (decyzja właścicielska 2026-06-19). Restore usuwa item z listy bezwarunkowo (opuszcza kosz w obu
// kierunkach: deleted→accepted, rejected→pending). „Wyczyść kosz" to globalny twardy DELETE z obowiązkowym
// potwierdzeniem.
//
// S-09: lista należy do `useItemList` (filtr typu SERWEROWY przez kryteria z URL). Zmiana filtra = re-fetch;
// restore/empty = optimistic przez `applyOptimistic`. UWAGA: po migracji `items` to lista PRZEFILTROWANA
// serwerowo, więc nie znamy już łącznej liczby kosza po stronie klienta — dialog „Wyczyść kosz" pokazuje
// konkretną liczbę tylko bez aktywnego filtra (`type==="all"`); przy filtrze opiera się na treści „CAŁY kosz"
// i liczbie z toastu po akcji (serwer zwraca faktycznie usuniętą liczbę).
export default function TrashItemsView({ initialItems, initialCriteria }: Props) {
  const { items, criteria, settledCriteria, setCriteria, applyOptimistic, error } = useItemList(
    "trash",
    initialItems,
    initialCriteria,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set());
  // Potwierdzenie restore (select-all): id do przywrócenia po akceptacji. Potwierdzenie empty: boolean.
  const [confirmRestore, setConfirmRestore] = useState<string[] | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  // Synchroniczny zamek re-entry (jak AcceptedItemsView): stan aktualizuje się po re-renderze, ref od razu.
  const inFlightRef = useRef(false);
  const { restoreFromTrash, emptyTrash, pending } = useItemMutation();

  // Lista renderowana = `items` z hooka (już zawężone serwerowo wg `criteria`). Zaznaczanie i licznik operują
  // na tej liście; invariant „selected ⊆ widoczne" utrzymuje czyszczenie selekcji przy zmianie filtra.
  const allSelected = isAllSelected(selected.size, items.length);
  const selectedCount = selected.size;
  // Bazuje na `settledCriteria` (pasują do wyświetlanej listy), nie na żywych `criteria` — inaczej zmiana filtra
  // przełączałaby układ (pasek/pusty stan) przed nadejściem danych → migotanie. Kontrolki paska i tak odbijają
  // żywe `criteria`, więc pozostają responsywne.
  const filtersActive = hasActiveFilters(settledCriteria);

  function toggleItem(id: string): void {
    setSelected((prev) => toggleSelection(prev, id));
  }

  function toggleAll(): void {
    setSelected((prev) => (isAllSelected(prev.size, items.length) ? new Set() : allIds(items)));
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
    applyOptimistic((prev) => removeByIds(prev, idSet));
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
    if (requiresConfirmation(ids.length, items.length)) {
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
  // filtrami) — stan listy czyścimy do pustej (optimistic), bo serwer skasował wszystkie wiersze usera.
  async function executeEmpty(): Promise<void> {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const count = await emptyTrash();
    if (count === null) {
      toast.error("Nie udało się opróżnić kosza. Spróbuj ponownie.");
      inFlightRef.current = false;
      return;
    }
    applyOptimistic(() => []);
    setSelected(new Set());
    toast.success(`Kosz opróżniony — trwale usunięto ${count} ${elementNoun(count)}.`);
    inFlightRef.current = false;
  }

  function confirmEmptyProceed(): void {
    setConfirmEmpty(false);
    void executeEmpty();
  }

  // Każda zmiana kryterium z paska filtrów → wyczyść zaznaczenie (invariant „selected ⊆ widoczne" — po
  // re-fetchu skład listy się zmienia) i re-fetchuj (autorytatywna lista z serwera).
  function applyCriteria(next: ListCriteria): void {
    setSelected(new Set());
    setCriteria(next);
  }

  // Ponów ostatni fetch wg bieżących kryteriów (po błędzie sieci) — bez zmiany kryteriów i bez czyszczenia
  // zaznaczenia (przy powodzeniu skład listy się nie zmienia).
  function retry(): void {
    setCriteria({ ...criteria });
  }

  return (
    <div className="flex flex-col gap-3">
      <Toaster />

      {/* Pasek filtrów + „Wyczyść kosz" widoczny, gdy jest co filtrować ALBO gdy jakikolwiek filtr jest
          aktywny — w drugim przypadku lista może być pusta (zawężona), a kontrolki MUSZĄ zostać dostępne
          (powrót do domyślnych oraz globalne czyszczenie kosza, który poza filtrem wciąż może mieć itemy). */}
      {(items.length > 0 || filtersActive) && (
        <ListFilterBar criteria={criteria} onChange={applyCriteria} error={error} onRetry={retry}>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              setConfirmEmpty(true);
            }}
          >
            Wyczyść kosz
          </Button>
        </ListFilterBar>
      )}

      {items.length === 0 ? (
        filtersActive ? (
          <div
            role="status"
            className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/70"
          >
            <span>Brak elementów dla wybranych filtrów.</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                applyCriteria(defaultCriteria("trash"));
              }}
              className="border-white/15 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
            >
              Wyczyść filtry
            </Button>
          </div>
        ) : (
          <div
            role="status"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/70"
          >
            Kosz jest pusty.
          </div>
        )
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
              {selectedCount > 0 ? `Zaznaczono: ${selectedCount}` : `${items.length} ${elementNoun(items.length)}`}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={selectedCount === 0 || pending} onClick={requestRestore}>
                Przywróć zaznaczone
              </Button>
            </div>
          </div>

          {items.map((item) => (
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
                  {/* Item w koszu ma zawsze status rejected|deleted (gwarancja predykatu widoku „trash"). */}
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

      {/* Potwierdzenie „Wyczyść kosz" — łączna liczba znana klientowi tylko BEZ filtra zawężającego liczbę
          (type==="all" ORAZ pusta fraza q — oba filtrują wiersze kosza); przy aktywnym filtrze pomijamy liczbę
          (lista jest zawężona), a treść niesie zakres „CAŁY kosz". Sort/dir nie zmieniają liczby — pomijane. */}
      <Dialog
        open={confirmEmpty}
        onOpenChange={(open) => {
          if (!open) setConfirmEmpty(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {criteria.type === "all" && criteria.q === ""
                ? `Wyczyścić kosz? Trwale usuniesz ${items.length} ${elementNoun(items.length)}.`
                : "Wyczyścić kosz?"}
            </DialogTitle>
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
