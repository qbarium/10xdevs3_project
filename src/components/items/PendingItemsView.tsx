import { useState } from "react";
import { toast } from "sonner";

import { useItemMutation } from "@/components/hooks/useItemMutation";
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
import { itemTypeLabel } from "@/lib/labels";
import type { Item } from "@/types";

interface Props {
  initialItems: Item[];
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
export default function PendingItemsView({ initialItems }: Props) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmRequest, setConfirmRequest] = useState<{ action: PendingAction; ids: string[] } | null>(null);
  const { bulkAccept, bulkReject, pending } = useItemMutation();

  const allSelected = isAllSelected(selected.size, items.length);
  const selectedCount = selected.size;

  function toggleItem(id: string): void {
    setSelected((prev) => toggleSelection(prev, id));
  }

  function toggleAll(): void {
    setSelected((prev) => (isAllSelected(prev.size, items.length) ? new Set() : allIds(items)));
  }

  async function execute(action: PendingAction, ids: string[]): Promise<void> {
    const snapshot = items;
    const snapshotSelection = selected;
    // Sekwencja optimistic: snapshot → usuń zaznaczone z listy → fetch → commit/rollback.
    setItems(removeByIds(items, new Set(ids)));
    setSelected(new Set());

    const ok = action === "accept" ? await bulkAccept(ids) : await bulkReject(ids);
    if (ok) {
      const verb = action === "accept" ? "Zatwierdzono" : "Odrzucono";
      toast.success(`${verb} ${ids.length} ${elementNoun(ids.length)}.`);
    } else {
      setItems(snapshot);
      setSelected(snapshotSelection);
      toast.error("Nie udało się wykonać akcji. Przywrócono listę.");
    }
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

  return (
    <div className="flex flex-col gap-3">
      <Toaster />

      {items.length === 0 ? (
        <div
          role="status"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/70"
        >
          Brak elementów do akceptacji.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <label className="flex items-center gap-2 text-sm text-white/80">
              <Checkbox
                checked={allSelected ? true : selectedCount > 0 ? "indeterminate" : false}
                onCheckedChange={toggleAll}
                aria-label="Zaznacz wszystkie"
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
                variant="destructive"
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
            <article
              key={item.id}
              className="flex gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl"
            >
              <Checkbox
                checked={selected.has(item.id)}
                onCheckedChange={() => {
                  toggleItem(item.id);
                }}
                aria-label={`Zaznacz: ${item.title}`}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <span className="inline-block rounded-full border border-purple-300/30 bg-purple-400/10 px-2 py-0.5 text-xs font-medium text-purple-100">
                  {itemTypeLabel(item.type)}
                </span>
                <h3 className="mt-2 font-semibold text-white/90">{item.title}</h3>
                {item.description && (
                  <p className="mt-1 text-sm whitespace-pre-wrap text-white/70">{item.description}</p>
                )}
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
            <Button variant={confirmRequest?.action === "reject" ? "destructive" : "default"} onClick={confirmProceed}>
              {confirmRequest ? ACTION_LABEL[confirmRequest.action] : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
