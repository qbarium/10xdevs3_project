import { useRef, useState } from "react";
import { toast } from "sonner";

import { useItemMutation } from "@/components/hooks/useItemMutation";
import OperationalStatusBadge from "@/components/items/OperationalStatusBadge";
import { reconcileAfterChange, type AcceptedView } from "@/components/items/operational-view";
import { allIds, isAllSelected, requiresConfirmation, toggleSelection } from "@/components/items/selection";
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
// model zaznaczania (selection.ts) + pessimistic dim + Dialog confirm na select-all + toast. Jednostka
// akcji to stan operacyjny: per-item przez klikalny OperationalStatusBadge (kuracja przejść), bulk przez
// 4 przyciski. Po sukcesie reconcileAfterChange usuwa itemy, których nowy stan wypada poza predykat widoku.
export default function AcceptedItemsView({ initialItems, view }: Props) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmRequest, setConfirmRequest] = useState<{ target: OperationalStatus; ids: string[] } | null>(null);
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set());
  // Synchroniczny zamek re-entry (jak PendingItemsView): stan aktualizuje się po re-renderze, ref od razu.
  const inFlightRef = useRef(false);
  const { setOperationalStatus, pending } = useItemMutation();

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
    if (requiresConfirmation(ids.length, items.length)) {
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

  return (
    <div className="flex flex-col gap-3">
      <Toaster />

      {items.length === 0 ? (
        <div
          role="status"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/70"
        >
          {EMPTY_LABEL[view]}
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
                  <OperationalStatusBadge
                    item={item}
                    disabled={pending}
                    onChange={(target) => {
                      void execute(target, [item.id]);
                    }}
                  />
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
    </div>
  );
}
