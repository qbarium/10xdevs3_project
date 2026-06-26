// Prawy panel master-detail (S-10): po wybraniu sesji po lewej dociąga jej elementy i renderuje je z
// badżami statusu/stanu oraz akcjami zależnymi od stanu akceptacji — reużywając EditItemDialog (edycja
// i tryb read-only) oraz mutacje kosza/przywracania. Każda akcja aktualizuje WYŁĄCZNIE jeden element w
// miejscu (replaceItem / setItemStatus z useSessionItems) — bez przeładowania listy, bez reorderu (sort
// po niezmiennym created_at), bez migotania. Read-only dla rejected/deleted wynika z nierenderowania akcji
// edycji/kosza; serwer i tak strzeże (edycja → 404, trash → no-op).

import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useItemMutation } from "@/components/hooks/useItemMutation";
import { useSessionItems } from "@/components/hooks/useSessionItems";
import EditItemDialog from "@/components/items/EditItemDialog";
import { Button } from "@/components/ui/button";
import { acceptanceStatusLabel, itemTypeLabel, operationalStatusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Item } from "@/types";

const PANEL_SHELL = "rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/70";

export default function SessionItemsPanel({ sessionId }: { sessionId: string | null }) {
  const { items, loading, error, replaceItem, setItemStatus } = useSessionItems(sessionId);
  const { moveToTrash, restoreFromTrashItems, acceptItems, rejectItems } = useItemMutation();
  // Jeden dialog dla edycji i podglądu — `readOnly` rozróżnia tryb; `key={item.id}` u dołu resetuje pola.
  const [dialogItem, setDialogItem] = useState<Item | null>(null);
  const [dialogReadOnly, setDialogReadOnly] = useState(false);
  // Element w locie (kosz/przywróć) — wyszarzony do odpowiedzi, by uniknąć podwójnej akcji.
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(new Set());

  function openEdit(item: Item): void {
    setDialogReadOnly(false);
    setDialogItem(item);
  }

  function openPreview(item: Item): void {
    setDialogReadOnly(true);
    setDialogItem(item);
  }

  function markInFlight(id: string, on: boolean): void {
    setInFlightIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Kosz: accepted → deleted. Element ZOSTAJE w panelu (import_session_id niezmieniony), przechodzi na
  // read-only. Wystarczy lokalna zmiana statusu (świeży wiersz niepotrzebny — element nie jest już edytowalny).
  async function handleTrash(id: string): Promise<void> {
    if (inFlightIds.has(id)) return;
    markInFlight(id, true);
    const count = await moveToTrash([id]);
    markInFlight(id, false);
    if (count === null) {
      toast.error("Nie udało się przenieść do kosza. Spróbuj ponownie.");
      return;
    }
    if (count > 0) {
      setItemStatus(id, "deleted");
      toast.success("Przeniesiono do kosza.");
    } else {
      toast("Element był już nieaktualny — odśwież widok.");
    }
  }

  // Przywróć: deleted → accepted / rejected → pending. Podmieniamy PEŁNY świeży wiersz (poprawny
  // updated_at), by element był od razu edytowalny bez fałszywego 409.
  async function handleRestore(id: string): Promise<void> {
    if (inFlightIds.has(id)) return;
    markInFlight(id, true);
    const restored = await restoreFromTrashItems([id]);
    markInFlight(id, false);
    if (restored === null) {
      toast.error("Nie udało się przywrócić. Spróbuj ponownie.");
      return;
    }
    const row = restored.find((it) => it.id === id);
    if (row) {
      replaceItem(row);
      toast.success("Przywrócono element.");
    } else {
      toast("Element był już nieaktualny — odśwież widok.");
    }
  }

  // Zaakceptuj: pending → accepted. Podmieniamy PEŁNY świeży wiersz (poprawny updated_at), by element był
  // od razu edytowalny bez fałszywego 409 (compare-and-swap). Element zostaje w panelu jako accepted.
  async function handleAccept(id: string): Promise<void> {
    if (inFlightIds.has(id)) return;
    markInFlight(id, true);
    const accepted = await acceptItems([id]);
    markInFlight(id, false);
    if (accepted === null) {
      toast.error("Nie udało się zaakceptować. Spróbuj ponownie.");
      return;
    }
    const row = accepted.find((it) => it.id === id);
    if (row) {
      replaceItem(row);
      toast.success("Zaakceptowano element.");
    } else {
      toast("Element był już nieaktualny — odśwież widok.");
    }
  }

  // Odrzuć: pending → rejected. Element zostaje w panelu (read-only, z możliwością przywrócenia).
  async function handleReject(id: string): Promise<void> {
    if (inFlightIds.has(id)) return;
    markInFlight(id, true);
    const rejected = await rejectItems([id]);
    markInFlight(id, false);
    if (rejected === null) {
      toast.error("Nie udało się odrzucić. Spróbuj ponownie.");
      return;
    }
    const row = rejected.find((it) => it.id === id);
    if (row) {
      replaceItem(row);
      toast.success("Odrzucono element.");
    } else {
      toast("Element był już nieaktualny — odśwież widok.");
    }
  }

  let body: ReactNode;
  if (sessionId === null) {
    body = <div className={PANEL_SHELL}>Wybierz sesję po lewej, aby zobaczyć jej elementy.</div>;
  } else if (loading) {
    body = <div className={PANEL_SHELL}>Wczytywanie elementów…</div>;
  } else if (error) {
    body = (
      <div
        role="alert"
        className="rounded-xl border border-red-300/30 bg-red-400/10 px-4 py-6 text-center text-sm text-red-100"
      >
        {error}
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <div role="status" className={PANEL_SHELL}>
        Ta sesja nie ma elementów.
      </div>
    );
  } else {
    body = (
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const editable = item.acceptance_status === "pending" || item.acceptance_status === "accepted";
          const inTrash = item.acceptance_status === "rejected" || item.acceptance_status === "deleted";
          return (
            <li
              key={item.id}
              className={cn(
                "flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl transition-opacity",
                inFlightIds.has(item.id) && "pointer-events-none opacity-50",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-block rounded-full border border-purple-300/30 bg-purple-400/10 px-2 py-0.5 text-xs font-medium text-purple-100">
                  {itemTypeLabel(item.type)}
                </span>
                <span className="inline-block rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs font-medium text-white/70">
                  {acceptanceStatusLabel(item.acceptance_status)}
                </span>
                {item.operational_status && (
                  <span className="inline-block rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs font-medium text-white/60">
                    {operationalStatusLabel(item.operational_status, item.type)}
                  </span>
                )}
                <div className="ml-auto flex gap-2">
                  {editable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-white/70 hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        openEdit(item);
                      }}
                    >
                      Edytuj
                    </Button>
                  )}
                  {item.acceptance_status === "accepted" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-white/70 hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        void handleTrash(item.id);
                      }}
                    >
                      Do kosza
                    </Button>
                  )}
                  {item.acceptance_status === "pending" && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-emerald-200/80 hover:bg-emerald-400/10 hover:text-emerald-100"
                        onClick={() => {
                          void handleAccept(item.id);
                        }}
                      >
                        Zaakceptuj
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-200/80 hover:bg-red-400/10 hover:text-red-100"
                        onClick={() => {
                          void handleReject(item.id);
                        }}
                      >
                        Odrzuć
                      </Button>
                    </>
                  )}
                  {inTrash && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-white/70 hover:bg-white/10 hover:text-white"
                        onClick={() => {
                          openPreview(item);
                        }}
                      >
                        Podgląd
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-white/70 hover:bg-white/10 hover:text-white"
                        onClick={() => {
                          void handleRestore(item.id);
                        }}
                      >
                        Przywróć
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <h3 className="font-semibold text-white/90">{item.title}</h3>
              {item.description && <p className="line-clamp-2 text-sm text-white/70">{item.description}</p>}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    // Nagłówek „Elementy sesji" oraz <Toaster/> żyją w ImportSessionsView — dzięki temu treść panelu jest
    // PIERWSZYM dzieckiem kolumny i startuje na tym samym poziomie co lista sesji po lewej (bez wiodącego gap).
    <div className="flex flex-col gap-3">
      {body}

      {dialogItem && (
        <EditItemDialog
          key={dialogItem.id}
          item={dialogItem}
          open
          readOnly={dialogReadOnly}
          onOpenChange={(open) => {
            if (!open) setDialogItem(null);
          }}
          onSaved={(updated) => {
            replaceItem(updated);
          }}
          onNotFound={() => {
            setDialogItem(null);
          }}
        />
      )}
    </div>
  );
}
