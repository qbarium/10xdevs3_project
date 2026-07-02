import { useRef, useState } from "react";
import { toast } from "sonner";

import { useItemList } from "@/components/hooks/useItemList";
import { useItemMutation } from "@/components/hooks/useItemMutation";
import EditItemDialog from "@/components/items/EditItemDialog";
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

type PendingAction = "accept" | "reject";

const ACTION_LABEL: Record<PendingAction, string> = { accept: "Zatwierdź", reject: "Odrzuć" };

/** Polska odmiana rzeczownika „element" wg liczby (1 / 2–4 / pozostałe). */
function elementNoun(n: number): string {
  if (n === 1) return "element";
  const tens = n % 100;
  const units = n % 10;
  if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) return "elementy";
  return "elementów";
}

// Interaktywny widok pendingów (React island, client:load). Model zaznaczania per-item + „zaznacz
// wszystkie", akcje zbiorcze z optimistic update + toast, potwierdzenie tylko na ścieżce select-all.
// Czysta logika zaznaczania/optimistic w `selection.ts` (testowana osobno).
//
// S-09: lista należy do `useItemList` (filtr typu SERWEROWY przez kryteria z URL — pending zyskuje filtr,
// którego wcześniej nie miał). Zmiana filtra = re-fetch; mutacje = optimistic przez `applyOptimistic`.
export default function PendingItemsView({ initialItems, initialCriteria, initialTotal }: Props) {
  const { items, criteria, settledCriteria, setCriteria, applyOptimistic, error, page, pageCount } = useItemList(
    "pending",
    initialItems,
    initialCriteria,
    initialTotal,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmRequest, setConfirmRequest] = useState<{ action: PendingAction; ids: string[] } | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set());
  // Synchroniczny zamek re-entry akcji (F1). Stan `pending`/`inFlightIds` aktualizuje się dopiero
  // po re-renderze; ref zmienia się natychmiast, więc blokuje drugie wejście w tym samym tknięciu.
  const inFlightRef = useRef(false);
  const { bulkAccept, bulkReject, pending } = useItemMutation();

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

  // Weryfikacja PRZED zmianą listy (pessimistic): elementy w locie są tylko WYGASZANE (dim),
  // a usuwane dopiero po sukcesie serwera. Lista nie „miga" — przy błędzie elementy wracają do
  // normalnego stanu, bez znikania i przywracania. Wspólne dla akcji zbiorczych i inline. Zmiany
  // nanosimy przez `applyOptimistic` (lista jest w gestii hooka; mutacja NIE wymusza re-fetchu).
  async function execute(action: PendingAction, ids: string[]): Promise<void> {
    // Zgodne z intencją „jedna akcja naraz" już wyrażoną przez `disabled={pending}` — zamek
    // domyka wyścig, gdy dwa szybkie kliknięcia padną zanim `pending=true` się przeflushuje.
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setInFlightIds(new Set(ids));
    const count = action === "accept" ? await bulkAccept(ids) : await bulkReject(ids);
    if (count === null) {
      toast.error("Nie udało się wykonać akcji. Spróbuj ponownie.");
      setInFlightIds(new Set());
      inFlightRef.current = false;
      return;
    }
    // Sukces: usuń zaznaczone z listy (wszystkie są już nie-pending) i z zaznaczenia.
    const idSet = new Set(ids);
    applyOptimistic((prev) => removeByIds(prev, idSet));
    setSelected((prev) => {
      if (!ids.some((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      idSet.forEach((id) => next.delete(id));
      return next;
    });
    // Licznik z serwera = liczba FAKTYCZNIE zmienionych (guard pomija itemy zmienione w innej karcie).
    if (count > 0) {
      const verb = action === "accept" ? "Zatwierdzono" : "Odrzucono";
      toast.success(`${verb} ${count} ${elementNoun(count)}.`);
    } else {
      toast("Wybrane elementy były już nieaktualne — lista odświeżona.");
    }
    setInFlightIds(new Set());
    inFlightRef.current = false;
  }

  function requestAction(action: PendingAction): void {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (requiresConfirmation(ids.length, items.length)) {
      setConfirmRequest({ action, ids });
    } else {
      void execute(action, ids);
    }
  }

  function confirmProceed(): void {
    if (!confirmRequest) return;
    const { action, ids } = confirmRequest;
    setConfirmRequest(null);
    void execute(action, ids);
  }

  // Edycja zapisana — podmiana itemu w miejscu (optimistic; zostaje pending, nie znika z listy).
  function handleSaved(updated: Item): void {
    applyOptimistic((prev) => prev.map((current) => (current.id === updated.id ? updated : current)));
  }

  // 404 podczas edycji (item nie jest już pending) — usuń z listy (optimistic) i z zaznaczenia.
  function handleRemoved(id: string): void {
    applyOptimistic((prev) => prev.filter((current) => current.id !== id));
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Toaster />

      {/* Pasek filtrów widoczny, gdy jest co filtrować ALBO gdy jakikolwiek filtr jest aktywny — w drugim
          przypadku lista może być pusta (zawężona), a kontrolki MUSZĄ zostać dostępne (powrót do domyślnych). */}
      {(items.length > 0 || filtersActive) && (
        <ListFilterBar
          criteria={criteria}
          onChange={(next) => {
            // Zmiana filtra/sortu/frazy → strona 1 (zakres wyników się zmienia; strona N mogłaby nie istnieć —
            // offset za końcem to błąd PGRST103). Wzorzec dziennika (S-11). Reset nie psuje debounce frazy:
            // isSearchOnlyChange ignoruje `page`.
            applyCriteria(resetToFirstPage(next));
          }}
          error={error}
          onRetry={retry}
        />
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
                // Czyść filtry/sort (i wróć na stronę 1), ale ZACHOWAJ rozmiar strony — preferencja widoku.
                applyCriteria({ ...defaultCriteria("pending"), size: criteria.size });
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
            Brak elementów do akceptacji.
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
                className={ITEM_CHECKBOX_CLASS}
              />
              Zaznacz wszystkie
            </label>
            <span className="text-sm text-white/50">
              {selectedCount > 0 ? `Zaznaczono: ${selectedCount}` : `${items.length} ${elementNoun(items.length)}`}
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="default"
                disabled={selectedCount === 0 || pending}
                onClick={() => {
                  requestAction("accept");
                }}
              >
                Zatwierdź zaznaczone
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={selectedCount === 0 || pending}
                onClick={() => {
                  requestAction("reject");
                }}
              >
                Odrzuć zaznaczone
              </Button>
            </div>
          </div>

          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              badges={{}}
              selectable
              selected={selected.has(item.id)}
              onToggleSelect={() => {
                toggleItem(item.id);
              }}
              inFlight={inFlightIds.has(item.id)}
              actionsDisabled={pending}
              onEdit={setEditing}
              onAccept={(it) => {
                void execute("accept", [it.id]);
              }}
              onReject={(it) => {
                void execute("reject", [it.id]);
              }}
            />
          ))}
        </>
      )}

      {/* Kontrolki stron (S-13 F2, parytet z dziennikiem): rozmiar strony (trwała preferencja + reset do 1)
          i nawigacja stron (zachowuje filtry z wyświetlanej listy). Zmiana czyści zaznaczenie (applyCriteria —
          invariant „selected ⊆ widoczne"). Pagination sama znika przy jednej stronie. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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

      <Dialog
        open={confirmRequest !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRequest(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmRequest
                ? `${ACTION_LABEL[confirmRequest.action]} ${confirmRequest.ids.length} ${elementNoun(confirmRequest.ids.length)}?`
                : ""}
            </DialogTitle>
            <DialogDescription>
              Akcja obejmuje wszystkie wyświetlane elementy. Czy na pewno chcesz kontynuować?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmRequest(null);
              }}
            >
              Anuluj
            </Button>
            <Button variant={confirmRequest?.action === "reject" ? "outline" : "default"} onClick={confirmProceed}>
              {confirmRequest ? ACTION_LABEL[confirmRequest.action] : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editing && (
        <EditItemDialog
          key={editing.id}
          item={editing}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSaved={handleSaved}
          onNotFound={handleRemoved}
        />
      )}
    </div>
  );
}
