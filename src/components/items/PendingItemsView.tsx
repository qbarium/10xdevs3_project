import { useRef, useState } from "react";
import { toast } from "sonner";

import { useItemMutation } from "@/components/hooks/useItemMutation";
import EditItemDialog from "@/components/items/EditItemDialog";
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
import { cn } from "@/lib/utils";
import type { Item } from "@/types";

interface Props {
  initialItems: Item[];
}

type PendingAction = "accept" | "reject";

const ACTION_LABEL: Record<PendingAction, string> = { accept: "Zatwierdź", reject: "Odrzuć" };

// Checkbox wyraźnie widoczny na ciemnym tle „cosmic" (domyślny border-input jest zbyt subtelny).
const CHECKBOX_CLASS =
  "size-5 border-white/40 data-[state=checked]:border-purple-400 data-[state=checked]:bg-purple-500 data-[state=checked]:text-white data-[state=indeterminate]:border-purple-400 data-[state=indeterminate]:bg-purple-500 data-[state=indeterminate]:text-white";

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
  const [editing, setEditing] = useState<Item | null>(null);
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set());
  // Synchroniczny zamek re-entry akcji (F1). Stan `pending`/`inFlightIds` aktualizuje się dopiero
  // po re-renderze; ref zmienia się natychmiast, więc blokuje drugie wejście w tym samym tknięciu.
  const inFlightRef = useRef(false);
  const { bulkAccept, bulkReject, pending } = useItemMutation();

  const allSelected = isAllSelected(selected.size, items.length);
  const selectedCount = selected.size;

  function toggleItem(id: string): void {
    setSelected((prev) => toggleSelection(prev, id));
  }

  function toggleAll(): void {
    setSelected((prev) => (isAllSelected(prev.size, items.length) ? new Set() : allIds(items)));
  }

  // Weryfikacja PRZED zmianą listy (pessimistic): elementy w locie są tylko WYGASZANE (dim),
  // a usuwane dopiero po sukcesie serwera. Lista nie „miga" — przy błędzie elementy wracają do
  // normalnego stanu, bez znikania i przywracania. Wspólne dla akcji zbiorczych i inline.
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
    setItems((prev) => removeByIds(prev, idSet));
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

  // Edycja zapisana — podmiana itemu w miejscu (zostaje pending, nie znika z listy).
  function handleSaved(updated: Item): void {
    setItems((prev) => prev.map((current) => (current.id === updated.id ? updated : current)));
  }

  // 404 podczas edycji (item nie jest już pending) — usuń z listy i z zaznaczenia (poprawka F2).
  function handleRemoved(id: string): void {
    setItems((prev) => prev.filter((current) => current.id !== id));
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  // 409 (ten sam pending edytowany równolegle w innej karcie — compare-and-swap, S-05) — przeładuj
  // widok SSR, by pokazać aktualny stan zamiast cichego nadpisania.
  function handleConflict(): void {
    window.location.reload();
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
                className={CHECKBOX_CLASS}
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
                <span className="inline-block rounded-full border border-purple-300/30 bg-purple-400/10 px-2 py-0.5 text-xs font-medium text-purple-100">
                  {itemTypeLabel(item.type)}
                </span>
                <h3 className="mt-2 font-semibold text-white/90">{item.title}</h3>
                {item.description && <p className="mt-1 line-clamp-2 text-sm text-white/70">{item.description}</p>}
              </div>
              <div className="flex shrink-0 items-start gap-1">
                <Button
                  variant="default"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    void execute("accept", [item.id]);
                  }}
                >
                  Zatwierdź
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    void execute("reject", [item.id]);
                  }}
                >
                  Odrzuć
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/60 hover:bg-white/10 hover:text-white"
                  onClick={() => {
                    setEditing(item);
                  }}
                >
                  Edytuj
                </Button>
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
          onConflict={handleConflict}
        />
      )}
    </div>
  );
}
