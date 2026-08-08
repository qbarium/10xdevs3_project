import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useItemList } from "@/components/hooks/useItemList";
import { useItemMutation } from "@/components/hooks/useItemMutation";
import { useItemTopbarBridge } from "@/components/hooks/useItemTopbarBridge";
import AddItemDialog from "@/components/items/AddItemDialog";
import { defaultCreateType, nextFilterAfterCreate } from "@/components/items/create-form";
import EditItemDialog from "@/components/items/EditItemDialog";
import { dispatchItemSearch } from "@/components/items/item-topbar-events";
import StateFilterSelect from "@/components/items/StateFilterSelect";
import ItemCard, { ITEM_CHECKBOX_CLASS } from "@/components/items/ItemCard";
import ListFilterBar from "@/components/items/ListFilterBar";
import { matchesView, reconcileAfterChange, type AcceptedView } from "@/components/items/operational-view";
import { allIds, isAllSelected, requiresConfirmation, toggleSelection } from "@/components/items/selection";
import type { TypeFilterValue } from "@/components/items/type-filter";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";
import { operationalStatusLabel } from "@/lib/labels";
import { defaultCriteria, hasActiveFilters, ITEM_PAGE_SIZES } from "@/lib/services/list-criteria";
import type { ListCriteria } from "@/lib/services/list-criteria";
import type { Item, OperationalStatus } from "@/types";

interface Props {
  initialItems: Item[];
  view: AcceptedView;
  /** Kryteria z adresu strony (czytane SERWEROWO tym samym parserem co klient) — stan startowy hooka, by SSR
      i pierwszy render wyspy były identyczne (hydration-stable, bez przeskoku). */
  initialCriteria: ListCriteria;
  /** Łączna liczba itemów pasujących do kryteriów (SSR z `count`) — stan startowy licznika stron (S-13 F2). */
  initialTotal: number;
  /** Czy pokazać akcję „Dodaj item" (S-07) — tylko widok Aktywne; Zakończone/Anulowane pomijają (domyślnie false). */
  canAdd?: boolean;
}

// Cztery przyciski bulk w kolejności cyklu życia (Nowe → W toku → Zakończone → Anulowane).
const BULK_TARGETS: OperationalStatus[] = ["new", "in_progress", "done", "cancelled"];

// Żądanie akcji zbiorczej wymagającej potwierdzenia (select-all). Dwa rodzaje: zmiana stanu operacyjnego
// (`operational` z `target`) oraz przeniesienie do kosza (`trash`, S-06 — bez `target`, bo to wyjście z
// wymiaru akceptacji, nie zmiana stanu operacyjnego).
type ConfirmRequest =
  | { kind: "operational"; target: OperationalStatus; ids: string[] }
  | { kind: "trash"; ids: string[] };

const EMPTY_LABEL: Record<AcceptedView, string> = {
  active: "Brak aktywnych elementów.",
  done: "Brak zakończonych elementów.",
  cancelled: "Brak anulowanych elementów.",
};

/** Polska odmiana rzeczownika „element" wg liczby (lokalne, jak w PendingItemsView — bez sprzęgania islandów). */
function elementNoun(n: number): string {
  if (n === 1) return "element";
  const tens = n % 100;
  const units = n % 10;
  if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) return "elementy";
  return "elementów";
}

// Interaktywny island widoków accepted (Aktywne/Zakończone/Anulowane). Reużywa wzorce PendingItemsView:
// model zaznaczania (selection.ts) + pessimistic dim + Dialog confirm na select-all + toast. Edycja
// per-item (w tym stan operacyjny) odbywa się w EditItemDialog — badge typu i stanu na liście są tylko
// do odczytu (rewizja UX S-05). Zmiana stanu wielu itemów naraz: bulk przez 4 przyciski. Po zmianie stanu
// (bulk lub edycja) reconcile usuwa itemy, których nowy stan wypada poza predykat widoku.
//
// S-09: lista należy do `useItemList` (filtr typu SERWEROWY przez kryteria z URL). Zmiana filtra = re-fetch
// (autorytatywna lista z serwera), mutacje = optimistic przez `applyOptimistic` (bez re-fetchu). Stąd brak
// klienckiego `applyTypeFilter`/`pinnedIds`/cookie: re-fetch przy zmianie filtra (nie edycja) usuwa item
// z widoku, więc edytowany item zostaje widoczny do następnej zmiany kryteriów (decyzja #6 — naturalnie).
export default function AcceptedItemsView({
  initialItems,
  view,
  initialCriteria,
  initialTotal,
  canAdd = false,
}: Props) {
  const {
    items,
    criteria,
    settledCriteria,
    setCriteria,
    applyOptimistic,
    refetchAfterRemoval,
    error,
    page,
    pageCount,
  } = useItemList(view, initialItems, initialCriteria, initialTotal);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Żądanie potwierdzenia (select-all) — unia rozróżniająca: zmiana stanu operacyjnego ALBO przeniesienie
  // do kosza (S-06). Dyskryminator `kind` steruje gałęzią `execute` i treścią dialogu.
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set());
  // S-07: stan modala dodawania. Id świeżo utworzonego itemu do sfokusowania trzymamy w REFIE (nie state),
  // by efekt focusu tylko go czytał/zerował — `setState` w efekcie łamie react-hooks/set-state-in-effect.
  const [addOpen, setAddOpen] = useState(false);
  const pendingFocusRef = useRef<string | null>(null);
  // Synchroniczny zamek re-entry (jak PendingItemsView): stan aktualizuje się po re-renderze, ref od razu.
  const inFlightRef = useRef(false);
  const { setOperationalStatus, moveToTrash, pending } = useItemMutation();

  // Lista renderowana = `items` z hooka (już przefiltrowane serwerowo wg `criteria`). Zaznaczanie i licznik
  // operują na tej liście; invariant „selected ⊆ widoczne" utrzymuje czyszczenie selekcji przy zmianie filtra.
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

  // Pessimistic: itemy w locie są WYGASZANE (dim), a nadawanie nowego stanu / usuwanie z listy
  // następuje dopiero po sukcesie serwera. Lista nie „miga" — przy błędzie wracają do normalnego stanu.
  // Dwie gałęzie (`req.kind`): zmiana stanu operacyjnego (setOperationalStatus + reconcile w obrębie
  // predykatu widoku) oraz przeniesienie do kosza (moveToTrash + usunięcie bezwarunkowe — item wychodzi
  // z `accepted`, więc opuszcza KAŻDY widok accepted niezależnie od stanu operacyjnego). Zmiany nanosimy
  // przez `applyOptimistic` (lista jest w gestii hooka; mutacja NIE wymusza re-fetchu).
  async function execute(req: ConfirmRequest): Promise<void> {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const { ids } = req;
    setInFlightIds(new Set(ids));
    const count = req.kind === "trash" ? await moveToTrash(ids) : await setOperationalStatus(ids, req.target);
    if (count === null) {
      toast.error("Nie udało się wykonać akcji. Spróbuj ponownie.");
      setInFlightIds(new Set());
      inFlightRef.current = false;
      return;
    }
    const idSet = new Set(ids);
    if (req.kind === "trash") {
      // Wyjście z accepted (nie zmiana stanu operacyjnego) → item znika z widoku BEZWARUNKOWO.
      applyOptimistic((prev) => prev.filter((item) => !idSet.has(item.id)));
    } else {
      // Sukces: nadaj nowy stan i usuń itemy wypadające poza predykat widoku.
      applyOptimistic((prev) => reconcileAfterChange(prev, idSet, req.target, view));
    }
    setSelected((prev) => {
      if (!ids.some((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      idSet.forEach((id) => next.delete(id));
      return next;
    });
    // Kolejka się dosuwa (decyzja 2026-07-02): dociągnij bieżącą stronę (clamp do nowej liczby stron) —
    // po koszu/zmianie stanu wypadającej poza widok wjeżdżają wpisy z kolejnych stron.
    refetchAfterRemoval();
    // Licznik z serwera = liczba FAKTYCZNIE zmienionych (guard `accepted` pomija nie-uprawnione).
    if (count > 0) {
      if (req.kind === "trash") {
        toast.success(`Przeniesiono ${count} ${elementNoun(count)} do kosza.`);
      } else {
        toast.success(`Zmieniono stan ${count} ${elementNoun(count)} na „${operationalStatusLabel(req.target)}”.`);
      }
    } else {
      toast("Wybrane elementy były już nieaktualne — lista odświeżona.");
    }
    setInFlightIds(new Set());
    inFlightRef.current = false;
  }

  function requestBulk(target: OperationalStatus): void {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (requiresConfirmation(ids.length, items.length)) {
      setConfirmRequest({ kind: "operational", target, ids });
    } else {
      void execute({ kind: "operational", target, ids });
    }
  }

  // Bulk „Do kosza" (S-06): potwierdzenie wg tego samego wzorca (tylko gdy zaznaczono wszystkie widoczne).
  function requestTrash(): void {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (requiresConfirmation(ids.length, items.length)) {
      setConfirmRequest({ kind: "trash", ids });
    } else {
      void execute({ kind: "trash", ids });
    }
  }

  function confirmProceed(): void {
    if (!confirmRequest) return;
    const req = confirmRequest;
    setConfirmRequest(null);
    void execute(req);
  }

  // Edycja zapisana — podmiana itemu w miejscu (optimistic, bez re-fetchu), ALE gdy zmieniony stan
  // operacyjny wypada poza predykat widoku (np. Aktywne → „Anulowane"), wpis ZNIKA i kolejka się dosuwa —
  // spójnie z akcjami zbiorczymi (rewizja decyzji #6 z 2026-06-19; decyzja użytkownika 2026-07-02:
  // pozostawiony wiersz z aktywnymi akcjami sugerował, że wpis nadal należy do widoku). Niezgodność z
  // FILTREM typu nadal zostawia wpis widoczny do następnej zmiany kryteriów (create-flow bez zmian).
  function handleSaved(updated: Item): void {
    if (!matchesView(updated.operational_status, view)) {
      applyOptimistic((prev) => prev.filter((current) => current.id !== updated.id));
      refetchAfterRemoval();
      return;
    }
    applyOptimistic((prev) => prev.map((current) => (current.id === updated.id ? updated : current)));
  }

  // Każda zmiana kryterium z paska filtrów → wyczyść zaznaczenie (invariant „selected ⊆ widoczne" — po
  // re-fetchu skład listy się zmienia) i re-fetchuj (autorytatywna lista z serwera).
  function applyCriteria(next: ListCriteria): void {
    setSelected(new Set());
    setCriteria(next);
  }

  // Zmiana samego filtra typu — cienka nakładka na `applyCriteria` zachowująca kontrakt `TypeFilterValue`
  // używany przez create-flow S-07 (`nextFilterAfterCreate` w `handleCreated`). Reset do strony 1 jak każda
  // zmiana filtra (offset za końcem zbioru to błąd PGRST103).
  function handleFilterChange(next: TypeFilterValue): void {
    applyCriteria(resetToFirstPage({ ...criteria, type: next }));
  }

  // Ponów ostatni fetch wg bieżących kryteriów (po błędzie sieci) — bez zmiany kryteriów i bez czyszczenia
  // zaznaczenia (przy powodzeniu skład listy się nie zmienia).
  function retry(): void {
    setCriteria({ ...criteria });
  }

  // 404 (item nieedytowalny / zniknął) — usuń z listy (optimistic) i z zaznaczenia,
  // po czym dociągnij stronę (kolejka się dosuwa).
  function handleRemoved(id: string): void {
    applyOptimistic((prev) => prev.filter((current) => current.id !== id));
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    refetchAfterRemoval();
  }

  // Utworzenie itemu ręcznego (S-07): focus + wstawienie. Jeśli aktywny jest KONKRETNY filtr innego typu,
  // przełączamy filtr na typ itemu (nextFilterAfterCreate → handleFilterChange → setCriteria): re-fetch
  // dostarcza autorytatywną listę z nowym itemem w jego widoku (decyzja użytkownika 2026-06-19, zamiast
  // przypinania do obcego filtra). Przy „all"/zgodnym filtrze nie przełączamy — wstawiamy item optimistycznie
  // na początek listy. id zapisujemy w refie; focus robi efekt po renderze (zależny od zmiany `items`),
  // niezależnie od tego, czy lista przyszła z re-fetchu, czy z optimistic insert.
  function handleCreated(item: Item): void {
    pendingFocusRef.current = item.id;
    const targetFilter = nextFilterAfterCreate(criteria.type, item.type);
    if (targetFilter !== criteria.type) {
      handleFilterChange(targetFilter);
    } else {
      applyOptimistic((prev) => [item, ...prev]);
    }
    setAddOpen(false);
  }

  // Po zmianie `items` (m.in. wstawieniu): jeśli czeka id do sfokusowania, przewiń do karty i sfokusuj ją
  // (uchwyt `data-item-id` + `tabIndex={-1}`), po czym wyzeruj ref. Efekt biegnie po renderze z już
  // widoczną kartą (filtr pasuje albo został przełączony), więc element jest w DOM. Ref (nie state) → brak
  // setState w efekcie.
  useEffect(() => {
    const id = pendingFocusRef.current;
    if (id === null) return;
    pendingFocusRef.current = null;
    const el = document.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest" });
      el.focus();
    }
  }, [items]);

  // Mostek do topbara powłoki (S-15 Faza 3): fraza z topbara stosowana przez `applyCriteria` (debounce hooka +
  // czyszczenie zaznaczenia — parytet dawnego SearchBox); akcja „Dodaj wpis" z topbara otwiera dialog (S-07,
  // tylko widok Aktywne — `canAdd`).
  useItemTopbarBridge({
    onSearch: (q) => {
      applyCriteria(resetToFirstPage({ ...criteria, q }));
    },
    onPrimaryAction: canAdd
      ? (action) => {
          if (action === "add") setAddOpen(true);
        }
      : undefined,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toaster />

      {/* NIERUCHOMY pasek (S-15 follow-up): oś stanu (zakładki + podfiltr „active"), filtr typu/sort oraz
          pasek zbiorczy — poza obszarem przewijania; przewija się WYŁĄCZNIE lista (własny scroll box niżej). */}
      <div className="flex shrink-0 flex-col gap-3 px-6 pt-6 pb-3">
        <StateFilterSelect view={view} type={criteria.type} opstatus={criteria.opstatus} />

        <ListFilterBar
          criteria={criteria}
          onChange={(next) => {
            // Zmiana filtra/sortu → strona 1 (zakres wyników się zmienia; strona N mogłaby nie istnieć —
            // offset za końcem to błąd PGRST103).
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
              {/* „Zmień stan" — jedna akcja z menu (zamiast rzędu pigułek mylących się z filtrem): jednoznacznie
                  zmienia stan ZAZNACZONYCH wpisów, nie filtruje listy. „Do kosza" osobno (wyjście z akceptacji). */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={selectedCount === 0 || pending}>
                    Zmień stan
                    <ChevronDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {BULK_TARGETS.map((target) => (
                    <DropdownMenuItem
                      key={target}
                      onSelect={() => {
                        requestBulk(target);
                      }}
                    >
                      {operationalStatusLabel(target)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" variant="outline" disabled={selectedCount === 0 || pending} onClick={requestTrash}>
                Do kosza
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
                  applyCriteria({ ...defaultCriteria(view), size: criteria.size });
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
              {EMPTY_LABEL[view]}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                badges={{ operational: true }}
                selectable
                selected={selected.has(item.id)}
                onToggleSelect={() => {
                  toggleItem(item.id);
                }}
                inFlight={inFlightIds.has(item.id)}
                actionsDisabled={pending}
                onEdit={setEditing}
                onTrash={(it) => {
                  // Per-item „Do kosza" (S-06) — akcja bezpośrednia na jednym itemie, bez dialogu.
                  void execute({ kind: "trash", ids: [it.id] });
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

      <Dialog
        open={confirmRequest !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRequest(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmRequest === null
                ? ""
                : confirmRequest.kind === "trash"
                  ? `Przenieść ${confirmRequest.ids.length} ${elementNoun(confirmRequest.ids.length)} do kosza?`
                  : `Zmienić stan ${confirmRequest.ids.length} ${elementNoun(confirmRequest.ids.length)} na „${operationalStatusLabel(confirmRequest.target)}”?`}
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
            <Button onClick={confirmProceed}>
              {confirmRequest === null
                ? ""
                : confirmRequest.kind === "trash"
                  ? "Do kosza"
                  : operationalStatusLabel(confirmRequest.target)}
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

      {canAdd && addOpen && (
        <AddItemDialog
          open
          defaultType={defaultCreateType(criteria.type)}
          onOpenChange={(open) => {
            if (!open) setAddOpen(false);
          }}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
