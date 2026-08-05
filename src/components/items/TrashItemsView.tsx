import { useRef, useState } from "react";
import { toast } from "sonner";

import { useItemList } from "@/components/hooks/useItemList";
import { useItemMutation } from "@/components/hooks/useItemMutation";
import { useItemTopbarBridge } from "@/components/hooks/useItemTopbarBridge";
import { dispatchItemSearch } from "@/components/items/item-topbar-events";
import StateFilterSelect from "@/components/items/StateFilterSelect";
import ItemCard, { ITEM_CHECKBOX_CLASS } from "@/components/items/ItemCard";
import ListFilterBar from "@/components/items/ListFilterBar";
import {
  allIds,
  isAllSelected,
  removeByIds,
  requiresConfirmation,
  toggleSelection,
} from "@/components/items/selection";
import { ITEMS_LIST_PAGE_SIZE_KEY, writePageSizePref } from "@/components/lists/page-size-pref";
import PageSizeSelect from "@/components/lists/PageSizeSelect";
import Pagination from "@/components/lists/Pagination";
import { resetToFirstPage } from "@/components/lists/list-pagination";
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
import { defaultCriteria, hasActiveFilters, ITEM_PAGE_SIZES } from "@/lib/services/list-criteria";
import type { ListCriteria } from "@/lib/services/list-criteria";
import type { Item } from "@/types";

interface Props {
  initialItems: Item[];
  /** Kryteria z adresu strony (czytane SERWEROWO tym samym parserem co klient) — stan startowy hooka, by SSR
      i pierwszy render wyspy były identyczne (hydration-stable, bez przeskoku). */
  initialCriteria: ListCriteria;
  /** Łączna liczba itemów pasujących do kryteriów (SSR z `count`) — stan startowy licznika stron (S-13 F2). */
  initialTotal: number;
}

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
export default function TrashItemsView({ initialItems, initialCriteria, initialTotal }: Props) {
  const {
    items,
    criteria,
    settledCriteria,
    setCriteria,
    applyOptimistic,
    refetchAfterRemoval,
    error,
    total,
    page,
    pageCount,
  } = useItemList("trash", initialItems, initialCriteria, initialTotal);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set());
  // Potwierdzenie restore (select-all): id do przywrócenia po akceptacji. Potwierdzenie empty: boolean.
  const [confirmRestore, setConfirmRestore] = useState<string[] | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  // Synchroniczny zamek re-entry (jak AcceptedItemsView): stan aktualizuje się po re-renderze, ref od razu.
  const inFlightRef = useRef(false);
  const { restoreFromTrash, emptyTrash, pending } = useItemMutation();

  // Mostek do topbara powłoki (S-15 Faza 3): fraza z topbara przez `applyCriteria` (debounce hooka +
  // czyszczenie zaznaczenia); „Wyczyść kosz" z topbara otwiera potwierdzenie (destrukcyjny twardy DELETE).
  useItemTopbarBridge({
    onSearch: (q) => {
      applyCriteria(resetToFirstPage({ ...criteria, q }));
    },
    onPrimaryAction: (action) => {
      if (action === "empty-trash") setConfirmEmpty(true);
    },
  });

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
    // Kolejka się dosuwa (decyzja 2026-07-02): dociągnij bieżącą stronę (clamp do nowej liczby stron).
    refetchAfterRemoval();
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
  // Dociągnięcie JAWNIE na stronę 1: lokalna korekta `total` zna tylko bieżącą stronę, a serwer wyzerował
  // wszystko — fetch strony 1 przynosi prawdziwy (pusty) stan i licznik.
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
    refetchAfterRemoval(1);
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
    <div className="flex min-h-0 flex-1 flex-col">
      <Toaster />

      {/* NIERUCHOMY pasek (S-15 follow-up): zakładki zakresu, pasek filtrów oraz pasek zbiorczy — poza
          obszarem przewijania; przewija się WYŁĄCZNIE lista (własny scroll box niżej). */}
      <div className="flex shrink-0 flex-col gap-3 px-6 pt-6 pb-3">
        {/* Zakładki zakresu (S-15 Faza 3): Kosz aktywny; pełna nawigacja na inne widoki (niosą filtr typu).
            Bez podfiltra „active" (to nie widok Aktywne). Szukajka i „Wyczyść kosz" żyją w topbarze powłoki. */}
        <StateFilterSelect view="trash" type={criteria.type} opstatus={undefined} />

        <ListFilterBar
          criteria={criteria}
          onChange={(next) => {
            // Zmiana filtra/sortu → strona 1 (offset za końcem to błąd PGRST103).
            applyCriteria(resetToFirstPage(next));
          }}
          error={error}
          onRetry={retry}
        />

        {items.length > 0 && (
          <div className="border-border bg-muted flex flex-wrap items-center gap-3 rounded-[5px] border px-4 py-3">
            <label className="text-foreground flex items-center gap-2 text-sm">
              <Checkbox
                checked={allSelected ? true : selectedCount > 0 ? "indeterminate" : false}
                onCheckedChange={toggleAll}
                aria-label="Zaznacz wszystkie"
                className={ITEM_CHECKBOX_CLASS}
              />
              Zaznacz wszystkie
            </label>
            <span className="text-muted-foreground text-sm">
              {selectedCount > 0 ? `Zaznaczono: ${selectedCount}` : `${items.length} ${elementNoun(items.length)}`}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={selectedCount === 0 || pending} onClick={requestRestore}>
                Przywróć zaznaczone
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Lista — JEDYNY obszar przewijania (scroll ograniczony do listy; treść przycięta do jej ramki). */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6">
        {items.length === 0 ? (
          filtersActive ? (
            <div
              role="status"
              className="border-border bg-card text-muted-foreground flex flex-col items-center gap-3 rounded-[5px] border px-4 py-6 text-center text-sm"
            >
              <span>Brak elementów dla wybranych filtrów.</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  // Czyść filtry/sort (i wróć na stronę 1), ale ZACHOWAJ rozmiar strony — preferencja widoku.
                  // Zsynchronizuj też input szukajki w topbarze (fraza wyzerowana).
                  applyCriteria({ ...defaultCriteria("trash"), size: criteria.size });
                  dispatchItemSearch("", "list");
                }}
              >
                Wyczyść filtry
              </Button>
            </div>
          ) : (
            <div
              role="status"
              className="border-border bg-card text-muted-foreground rounded-[5px] border px-4 py-6 text-center text-sm"
            >
              Kosz jest pusty.
            </div>
          )
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                badges={{ origin: true }}
                selectable
                selected={selected.has(item.id)}
                onToggleSelect={() => {
                  toggleItem(item.id);
                }}
                inFlight={inFlightIds.has(item.id)}
                actionsDisabled={pending}
                onRestore={(it) => {
                  void executeRestore([it.id]);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Kontrolki stron (S-13 F2, parytet z dziennikiem): rozmiar strony (trwała preferencja + reset do 1)
          i nawigacja stron (zachowuje filtry z wyświetlanej listy). Zmiana czyści zaznaczenie (applyCriteria —
          invariant „selected ⊆ widoczne"). Pagination sama znika przy jednej stronie. */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-6 pt-3 pb-6">
        <PageSizeSelect
          value={criteria.size}
          sizes={ITEM_PAGE_SIZES}
          ariaLabel="Liczba elementów na stronę"
          onChange={(size) => {
            writePageSizePref(ITEMS_LIST_PAGE_SIZE_KEY, ITEM_PAGE_SIZES, size);
            applyCriteria(resetToFirstPage({ ...criteria, size }));
          }}
        />
        <Pagination
          page={page}
          pageCount={pageCount}
          ariaLabel="Paginacja listy elementów"
          onPage={(nextPage) => {
            applyCriteria({ ...settledCriteria, page: nextPage });
          }}
        />
      </div>

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
          (lista jest zawężona), a treść niesie zakres „CAŁY kosz". Sort/dir nie zmieniają liczby — pomijane.
          Od paginacji (S-13 F2) liczbą jest `total` z hooka (items.length to tylko bieżąca strona). */}
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
                ? `Wyczyścić kosz? Trwale usuniesz ${total} ${elementNoun(total)}.`
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
