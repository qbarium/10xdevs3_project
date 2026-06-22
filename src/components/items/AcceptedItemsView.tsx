import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useItemList } from "@/components/hooks/useItemList";
import { useItemMutation } from "@/components/hooks/useItemMutation";
import AddItemDialog from "@/components/items/AddItemDialog";
import { defaultCreateType, nextFilterAfterCreate } from "@/components/items/create-form";
import EditItemDialog from "@/components/items/EditItemDialog";
import OperationalStatusBadge from "@/components/items/OperationalStatusBadge";
import { reconcileAfterChange, type AcceptedView } from "@/components/items/operational-view";
import { allIds, isAllSelected, requiresConfirmation, toggleSelection } from "@/components/items/selection";
import TypeFilter from "@/components/items/TypeFilter";
import type { TypeFilterValue } from "@/components/items/type-filter";
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
import { itemTypeLabel, operationalStatusLabel } from "@/lib/labels";
import type { ListCriteria } from "@/lib/services/list-criteria";
import { cn } from "@/lib/utils";
import type { Item, OperationalStatus } from "@/types";

interface Props {
  initialItems: Item[];
  view: AcceptedView;
  /** Kryteria z adresu strony (czytane SERWEROWO tym samym parserem co klient) — stan startowy hooka, by SSR
      i pierwszy render wyspy były identyczne (hydration-stable, bez przeskoku). */
  initialCriteria: ListCriteria;
  /** Czy pokazać akcję „Dodaj item" (S-07) — tylko widok Aktywne; Zakończone/Anulowane pomijają (domyślnie false). */
  canAdd?: boolean;
}

// Cztery przyciski bulk w kolejności cyklu życia (Nowe → W toku → Zrobione → Anulowane).
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

// Checkbox wyraźnie widoczny na ciemnym tle „cosmic" (jak PendingItemsView).
const CHECKBOX_CLASS =
  "size-5 border-white/40 data-[state=checked]:border-purple-400 data-[state=checked]:bg-purple-500 data-[state=checked]:text-white data-[state=indeterminate]:border-purple-400 data-[state=indeterminate]:bg-purple-500 data-[state=indeterminate]:text-white";

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
export default function AcceptedItemsView({ initialItems, view, initialCriteria, canAdd = false }: Props) {
  const { items, criteria, setCriteria, applyOptimistic } = useItemList(view, initialItems, initialCriteria);
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

  // Edycja zapisana — podmiana itemu w miejscu (optimistic, bez re-fetchu). Edytowany item ZOSTAJE widoczny
  // do następnej zmiany kryteriów / odświeżenia (decyzja #6) — także gdy zmieniony stan operacyjny lub typ
  // wypada poza bieżący widok/filtr. NIE znika spod kursora; przepada dopiero przy re-fetchu (zmiana filtra)
  // lub reloadzie SSR (który ładuje listę wg kryteriów). Inaczej niż bulk, który usuwa od razu.
  function handleSaved(updated: Item): void {
    applyOptimistic((prev) => prev.map((current) => (current.id === updated.id ? updated : current)));
  }

  // Zmiana filtra typu → re-fetch (autorytatywna lista z serwera) + wyczyszczenie selekcji (invariant
  // selected ⊆ widoczne — zaznaczać można tylko widoczne itemy; po re-fetchu skład listy się zmienia).
  function handleFilterChange(next: TypeFilterValue): void {
    setSelected(new Set());
    setCriteria({ ...criteria, type: next });
  }

  // 404 (item nieedytowalny / zniknął) — usuń z listy (optimistic) i z zaznaczenia.
  function handleRemoved(id: string): void {
    applyOptimistic((prev) => prev.filter((current) => current.id !== id));
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
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

  return (
    <div className="flex flex-col gap-3">
      <Toaster />

      {/* Trwały rząd akcji — PRZED gałęzią pustej listy, więc „Dodaj item" jest widoczny także przy pustym
          widoku / pustym wyniku filtra (tylko Aktywne: `canAdd`). Osobny od paska bulk (ten zależy od selekcji). */}
      {canAdd && (
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            onClick={() => {
              setAddOpen(true);
            }}
          >
            Dodaj item
          </Button>
        </div>
      )}

      {/* Filtr typu widoczny, gdy jest co filtrować ALBO gdy filtr jest aktywny (`type !== "all"`) — w drugim
          przypadku lista może być pusta, a kontrolka MUSI zostać dostępna, by dało się wrócić do „Wszystkie". */}
      {(items.length > 0 || criteria.type !== "all") && (
        <TypeFilter value={criteria.type} onChange={handleFilterChange} />
      )}

      {items.length === 0 ? (
        <div
          role="status"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/70"
        >
          {criteria.type !== "all" ? "Brak elementów tego typu w tym widoku." : EMPTY_LABEL[view]}
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
              {selectedCount > 0 ? `Zaznaczono: ${selectedCount}` : `${items.length} ${elementNoun(items.length)}`}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              {BULK_TARGETS.map((target) => (
                <Button
                  key={target}
                  size="sm"
                  variant="outline"
                  disabled={selectedCount === 0 || pending}
                  onClick={() => {
                    requestBulk(target);
                  }}
                >
                  {operationalStatusLabel(target)}
                </Button>
              ))}
              {/* „Do kosza" (S-06) — ten sam outline co 4 przyciski stanu (czytelny też w disabled);
                  odróżnia go etykieta i pozycja. Czerwień zarezerwowana dla „Wyczyść kosz" (trwałe). */}
              <Button size="sm" variant="outline" disabled={selectedCount === 0 || pending} onClick={requestTrash}>
                Do kosza
              </Button>
            </div>
          </div>

          {items.map((item) => (
            <article
              key={item.id}
              data-item-id={item.id}
              tabIndex={-1}
              className={cn(
                "flex gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl transition-opacity focus:ring-2 focus:ring-purple-400/60 focus:outline-none",
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
                  <OperationalStatusBadge item={item} />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-white/60 hover:bg-white/10 hover:text-white"
                    onClick={() => {
                      setEditing(item);
                    }}
                  >
                    Edytuj
                  </Button>
                  {/* Per-item „Do kosza" (S-06) — akcja bezpośrednia na jednym itemie, bez dialogu. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white/60 hover:bg-white/10 hover:text-white"
                    disabled={pending}
                    onClick={() => {
                      void execute({ kind: "trash", ids: [item.id] });
                    }}
                  >
                    Do kosza
                  </Button>
                </div>
                <h3 className="mt-2 font-semibold text-white/90">{item.title}</h3>
                {item.description && <p className="mt-1 line-clamp-2 text-sm text-white/70">{item.description}</p>}
              </div>
            </article>
          ))}
        </>
      )}

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
