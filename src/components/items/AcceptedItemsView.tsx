import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useItemMutation } from "@/components/hooks/useItemMutation";
import AddItemDialog from "@/components/items/AddItemDialog";
import { defaultCreateType, nextFilterAfterCreate } from "@/components/items/create-form";
import EditItemDialog from "@/components/items/EditItemDialog";
import OperationalStatusBadge from "@/components/items/OperationalStatusBadge";
import { reconcileAfterChange, type AcceptedView } from "@/components/items/operational-view";
import { allIds, isAllSelected, requiresConfirmation, toggleSelection } from "@/components/items/selection";
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
import { itemTypeLabel, operationalStatusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Item, OperationalStatus } from "@/types";

interface Props {
  initialItems: Item[];
  view: AcceptedView;
  /** Filtr typu z cookie (czytany SERWEROWO) — stan początkowy islandu, by SSR renderował od razu poprawnie. */
  initialTypeFilter: TypeFilterValue;
  /** Czy pokazać akcję „Dodaj item" (S-07) — tylko widok Aktywne; Zakończone/Anulowane pomijają (domyślnie false). */
  canAdd?: boolean;
}

// Cztery przyciski bulk w kolejności cyklu życia (Nowe → W toku → Zrobione → Anulowane).
const BULK_TARGETS: OperationalStatus[] = ["new", "in_progress", "done", "cancelled"];

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
export default function AcceptedItemsView({ initialItems, view, initialTypeFilter, canAdd = false }: Props) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmRequest, setConfirmRequest] = useState<{ target: OperationalStatus; ids: string[] } | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilterValue>(initialTypeFilter);
  // „Przypięte" id: itemy, które po edycji zmieniającej typ wypadły z aktywnego filtra, ale mają zostać
  // widoczne do najbliższego przełączenia filtra / odświeżenia (decyzja #6). Czyszczone przy zmianie filtra.
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set());
  // S-07: stan modala dodawania. Id świeżo utworzonego itemu do sfokusowania trzymamy w REFIE (nie state),
  // by efekt focusu tylko go czytał/zerował — `setState` w efekcie łamie react-hooks/set-state-in-effect.
  const [addOpen, setAddOpen] = useState(false);
  const pendingFocusRef = useRef<string | null>(null);
  // Synchroniczny zamek re-entry (jak PendingItemsView): stan aktualizuje się po re-renderze, ref od razu.
  const inFlightRef = useRef(false);
  const { setOperationalStatus, pending } = useItemMutation();

  // Lista renderowana = itemy przefiltrowane po typie (z wyłomem „przypiętych"). Zaznaczanie i licznik
  // operują na WIDOCZNYCH itemach; invariant „selected ⊆ widoczne" utrzymuje czyszczenie selekcji przy
  // zmianie filtra (zaznaczać można tylko widoczne, a edycja zmieniająca typ przypina item w widoku).
  const visibleItems = applyTypeFilter(items, typeFilter, pinnedIds);
  const allSelected = isAllSelected(selected.size, visibleItems.length);
  const selectedCount = selected.size;

  function toggleItem(id: string): void {
    setSelected((prev) => toggleSelection(prev, id));
  }

  function toggleAll(): void {
    setSelected((prev) => (isAllSelected(prev.size, visibleItems.length) ? new Set() : allIds(visibleItems)));
  }

  // Pessimistic: itemy w locie są WYGASZANE (dim), a nadawanie nowego stanu / usuwanie z listy
  // następuje dopiero po sukcesie serwera. Lista nie „miga" — przy błędzie wracają do normalnego stanu.
  async function execute(target: OperationalStatus, ids: string[]): Promise<void> {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setInFlightIds(new Set(ids));
    const count = await setOperationalStatus(ids, target);
    if (count === null) {
      toast.error("Nie udało się wykonać akcji. Spróbuj ponownie.");
      setInFlightIds(new Set());
      inFlightRef.current = false;
      return;
    }
    // Sukces: nadaj nowy stan i usuń itemy wypadające poza predykat widoku; wyczyść je z zaznaczenia.
    const idSet = new Set(ids);
    setItems((prev) => reconcileAfterChange(prev, idSet, target, view));
    setSelected((prev) => {
      if (!ids.some((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      idSet.forEach((id) => next.delete(id));
      return next;
    });
    // Licznik z serwera = liczba FAKTYCZNIE zmienionych (guard `accepted` pomija nie-uprawnione).
    if (count > 0) {
      toast.success(`Zmieniono stan ${count} ${elementNoun(count)} na „${operationalStatusLabel(target)}”.`);
    } else {
      toast("Wybrane elementy były już nieaktualne — lista odświeżona.");
    }
    setInFlightIds(new Set());
    inFlightRef.current = false;
  }

  function requestBulk(target: OperationalStatus): void {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (requiresConfirmation(ids.length, visibleItems.length)) {
      setConfirmRequest({ target, ids });
    } else {
      void execute(target, ids);
    }
  }

  function confirmProceed(): void {
    if (!confirmRequest) return;
    const { target, ids } = confirmRequest;
    setConfirmRequest(null);
    void execute(target, ids);
  }

  // Edycja zapisana — podmiana itemu w miejscu z nowymi polami. Edytowany item ZOSTAJE widoczny do
  // odświeżenia / przełączenia (decyzja #6) — także gdy zmieniony stan operacyjny lub typ wypada poza
  // bieżący widok/filtr. NIE znika spod kursora; przepada dopiero po reloadzie SSR (który ładuje listę
  // wg widoku). To celowy wyłom z czystej derywacji — inaczej niż bulk, który usuwa od razu.
  function handleSaved(updated: Item): void {
    setItems((prev) => prev.map((current) => (current.id === updated.id ? updated : current)));
    // Przy aktywnym filtrze typu: jeśli nowy typ nie pasuje, przypnij item — inaczej `applyTypeFilter`
    // by go ukrył; przypięty zostaje widoczny do przełączenia filtra / odświeżenia (decyzja #6).
    if (typeFilter !== "all" && updated.type !== typeFilter) {
      setPinnedIds((prev) => new Set(prev).add(updated.id));
    }
  }

  // Zmiana filtra typu: wyczyść „przypięte" (przestają obowiązywać) oraz selekcję (utrzymanie invariantu
  // selected ⊆ widoczne — zaznaczać można tylko widoczne itemy).
  function handleFilterChange(next: TypeFilterValue): void {
    setTypeFilter(next);
    setPinnedIds(new Set());
    setSelected(new Set());
    // Wspólny cookie (session, poza URL) — serwer odczyta go przy każdym SSR (refresh ORAZ nawigacja
    // między widokami) i wyrenderuje od razu poprawnie przefiltrowaną listę, bez przeskoku ani skoku na
    // nieaktualny filtr innego widoku.
    // `Secure` dokładamy tylko po HTTPS — na http-dev Secure-cookie nie byłoby odsyłane, więc SSR
    // straciłby filtr; w produkcji (HTTPS) flaga obowiązuje dla spójności.
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${TYPE_FILTER_COOKIE}=${next}; path=/; SameSite=Lax${secure}`;
  }

  // 404 (item nieedytowalny / zniknął) — usuń z listy i z zaznaczenia.
  function handleRemoved(id: string): void {
    setItems((prev) => prev.filter((current) => current.id !== id));
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  // Utworzenie itemu ręcznego (S-07): insert + (ew.) przełączenie filtra + focus. Wstawiamy item na początek
  // `items`; jeśli aktywny jest KONKRETNY filtr innego typu, przełączamy filtr na typ itemu
  // (nextFilterAfterCreate → handleFilterChange) — item wchodzi do listy NATURALNIE, w swoim widoku (decyzja
  // użytkownika 2026-06-19, zamiast przypinania do obcego filtra). Przy „all"/zgodnym filtrze nie przełączamy.
  // EDYCJA zmieniająca typ zachowuje przypięcie (decyzja #6, handleSaved) — to celowa asymetria create vs edit.
  // id zapisujemy w refie; focus robi efekt po renderze (zależny od zmiany `items`).
  function handleCreated(item: Item): void {
    setItems((prev) => [item, ...prev]);
    pendingFocusRef.current = item.id;
    const targetFilter = nextFilterAfterCreate(typeFilter, item.type);
    if (targetFilter !== typeFilter) handleFilterChange(targetFilter);
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

      {items.length === 0 ? (
        <div
          role="status"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/70"
        >
          {EMPTY_LABEL[view]}
        </div>
      ) : (
        <>
          <TypeFilter value={typeFilter} onChange={handleFilterChange} />

          {visibleItems.length === 0 ? (
            <div
              role="status"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/70"
            >
              Brak elementów tego typu w tym widoku.
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
                </div>
              </div>

              {visibleItems.map((item) => (
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
                ? `Zmienić stan ${confirmRequest.ids.length} ${elementNoun(confirmRequest.ids.length)} na „${operationalStatusLabel(confirmRequest.target)}”?`
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
            <Button onClick={confirmProceed}>
              {confirmRequest ? operationalStatusLabel(confirmRequest.target) : ""}
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
          defaultType={defaultCreateType(typeFilter)}
          onOpenChange={(open) => {
            if (!open) setAddOpen(false);
          }}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
