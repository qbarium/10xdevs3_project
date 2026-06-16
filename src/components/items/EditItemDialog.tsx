import { Maximize2Icon, Minimize2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useItemMutation } from "@/components/hooks/useItemMutation";
import { buildEditPayload, isTitleValid } from "@/components/items/edit-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ITEM_TYPES } from "@/lib/ai/schema";
import { itemTypeLabel, operationalStatusLabel } from "@/lib/labels";
import { OPERATIONAL_STATUSES } from "@/lib/validation/items";
import type { Item, ItemType, OperationalStatus } from "@/types";

interface Props {
  item: Item;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sukces zapisu — wołane z zaktualizowanym itemem (podmiana w stanie islandu; stan operacyjny zachowany). */
  onSaved: (updated: Item) => void;
  /** 404 (item nie istnieje / nieedytowalny) — wołane, by usunąć item z listy islandu. */
  onNotFound: (id: string) => void;
}

// Modal edycji itemu (title/description/typ + stan operacyjny dla zaakceptowanych) — jedyne miejsce
// per-itemowej edycji (S-05, rewizja UX). Zapis natychmiastowy — akceptacja to osobna akcja (FR-010).
// Stan operacyjny edytujemy tu JAWNIE (selektor prefilluje bieżącą wartość → edycja treści go zachowuje);
// dla pendingów selektor jest ukryty (cykl życia zaczyna się po akceptacji). `item.updated_at` jedzie
// jako `expectedUpdatedAt` (optimistic concurrency → 409). Przełącznik rozmiaru (Maximize/Minimize)
// rozszerza okno na obszar listy (poniżej górnej nawigacji) dla długich itemów. Zamknięcie z niezapisanymi
// zmianami bramkuje pytanie.
export default function EditItemDialog({ item, open, onOpenChange, onSaved, onNotFound }: Props) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [type, setType] = useState<ItemType>(item.type);
  const [operationalStatus, setOperationalStatus] = useState<OperationalStatus>(item.operational_status ?? "new");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Tryb rozszerzony: jednym klikiem okno wypełnia obszar listy (poniżej górnej nawigacji), dając duże
  // pole edycji dla długich itemów. Reset przy zmianie itemu przez remount (`key={item.id}` u rodzica).
  const [expanded, setExpanded] = useState(false);
  const { editItem, pending } = useItemMutation();

  // Stan operacyjny edytowalny tylko dla zaakceptowanych — pending jest przed cyklem życia.
  const canEditStatus = item.acceptance_status === "accepted";

  // Rozszerzony: okno pozycjonowane `inset` (top-20 zostawia odsłoniętą górną nawigację) i ułożone jako
  // flex-kolumna — nagłówek i stopka (przyciski) PRZYPIĘTE, środek (pola) rośnie i scrolluje, a textarea
  // wypełnia wolną wysokość. Dzięki temu „Zapisz" zawsze widoczne, niezależnie od wysokości ekranu.
  // Normalny: okno rośnie wraz z polem (w-auto), limit 95vw / 85vh + scroll.
  const contentClass = expanded
    ? "top-20 right-4 bottom-4 left-4 flex w-auto max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden max-h-none sm:max-w-none"
    : "max-h-[85vh] w-auto max-w-[95vw] overflow-auto sm:max-w-[95vw]";
  const fieldsClass = expanded ? "flex min-h-0 flex-1 flex-col gap-4 overflow-auto" : "flex flex-col gap-4";
  const descriptionFieldClass = expanded ? "flex min-h-0 flex-1 flex-col gap-2" : "flex flex-col gap-2";
  const descriptionClass = expanded
    ? "field-sizing-fixed min-h-0 w-full flex-1 resize-none overflow-auto"
    : "field-sizing-fixed max-h-[65vh] min-h-28 w-[32rem] max-w-[90vw] min-w-[16rem] resize overflow-auto";

  // Pola inicjalizowane z propsów; reset przy zmianie itemu zapewnia remount przez `key={item.id}`.
  const titleInvalid = !isTitleValid(title);
  const isDirty =
    title !== item.title ||
    description !== (item.description ?? "") ||
    type !== item.type ||
    operationalStatus !== (item.operational_status ?? "new");

  async function handleSave(): Promise<void> {
    if (titleInvalid) return;
    // `item.updated_at` to znacznik z chwili otwarcia dialogu — serwer porówna go (compare-and-swap).
    // Przekazujemy go DOSŁOWNIE, bez re-formatowania — różnica reprezentacji dałaby fałszywy 409.
    const result = await editItem(
      item.id,
      buildEditPayload(title, description, type, operationalStatus),
      item.updated_at,
    );
    if (result.ok) {
      toast.success("Zapisano zmiany.");
      onSaved(result.item);
      onOpenChange(false);
    } else if (result.reason === "not_found") {
      toast.error("Element nie jest już dostępny do edycji.");
      onNotFound(item.id);
      onOpenChange(false);
    } else if (result.reason === "conflict") {
      // Auto-reload kasował dymek natychmiast („mignięcie"), bo twardy reload czyści stan sonnera.
      // Zamiast tego pokazujemy trwalszy komunikat (10 s) z akcją „Odśwież" — użytkownik odświeża,
      // gdy przeczyta (spójnie z treścią „odśwież, aby zobaczyć aktualną wersję").
      toast.error("Element został zmieniony w innym miejscu. Odśwież, aby zobaczyć aktualną wersję.", {
        duration: 10000,
        action: {
          label: "Odśwież",
          onClick: () => {
            window.location.reload();
          },
        },
      });
      onOpenChange(false);
    } else {
      toast.error("Nie udało się zapisać zmian. Spróbuj ponownie.");
    }
  }

  // Każda ścieżka zamknięcia (klik poza, Esc, X, Anuluj) przechodzi tędy: przy niezapisanych
  // zmianach pytamy zamiast zamykać; bez zmian zamykamy od razu.
  function requestClose(): void {
    if (isDirty) setConfirmDiscard(true);
    else onOpenChange(false);
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        {/* Szerokość `auto` (zamiast twardego max-w-lg) → okno rośnie też w POZIOMIE wraz z polem,
            symetrycznie do pionu; limit 95vw + scroll jako zabezpieczenie. */}
        <DialogContent className={contentClass}>
          {/* Przełącznik rozmiaru — obok przycisku zamknięcia (X). Maximize → wypełnij obszar listy. */}
          <button
            type="button"
            onClick={() => {
              setExpanded((value) => !value);
            }}
            aria-pressed={expanded}
            aria-label={expanded ? "Zmniejsz okno edycji" : "Rozszerz okno edycji na obszar listy"}
            className="ring-offset-background focus:ring-ring absolute top-4 right-12 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden"
          >
            {expanded ? <Minimize2Icon className="size-4" /> : <Maximize2Icon className="size-4" />}
            <span className="sr-only">{expanded ? "Zmniejsz okno" : "Rozszerz okno"}</span>
          </button>
          <DialogHeader className={expanded ? "shrink-0" : undefined}>
            <DialogTitle>Edytuj element</DialogTitle>
          </DialogHeader>

          <div className={fieldsClass}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-title">Tytuł</Label>
              <Input
                id="edit-title"
                value={title}
                aria-invalid={titleInvalid}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
              />
              {titleInvalid && <p className="text-destructive text-sm">Tytuł jest wymagany.</p>}
            </div>

            <div className={descriptionFieldClass}>
              <Label htmlFor="edit-description">Opis</Label>
              {/* field-sizing-fixed: bez auto-rozrostu przy Enterze; w trybie normalnym uchwyt `resize`
                  w OBU osiach (domyślne w-[32rem] / min-h-28, max 90vw / 65vh), w rozszerzonym wypełnia
                  wolną wysokość/szerokość (flex-1 / w-full). `key` zależny od trybu REMONTUJE textarea przy
                  przełączeniu — czyści inline width/height zapisane przez ręczny resize (inaczej inline style
                  nadpisałby klasy i textarea nie wypełniłaby okna po wcześniejszym ręcznym skalowaniu). */}
              <Textarea
                key={expanded ? "desc-expanded" : "desc-normal"}
                id="edit-description"
                value={description}
                className={descriptionClass}
                onChange={(event) => {
                  setDescription(event.target.value);
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-type">Typ</Label>
              <Select
                value={type}
                onValueChange={(value) => {
                  setType(value as ItemType);
                }}
              >
                <SelectTrigger id="edit-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {itemTypeLabel(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {canEditStatus && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-status">Stan</Label>
                <Select
                  value={operationalStatus}
                  onValueChange={(value) => {
                    setOperationalStatus(value as OperationalStatus);
                  }}
                >
                  <SelectTrigger id="edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATIONAL_STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {operationalStatusLabel(value, type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter className={expanded ? "shrink-0" : undefined}>
            <Button
              variant="outline"
              onClick={() => {
                requestClose();
              }}
            >
              Anuluj
            </Button>
            <Button
              disabled={titleInvalid || pending}
              onClick={() => {
                void handleSave();
              }}
            >
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmDiscard}
        onOpenChange={(next) => {
          if (!next) setConfirmDiscard(false);
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Niezapisane zmiany</DialogTitle>
            <DialogDescription>Masz niezapisane zmiany. Odrzucić je i zamknąć edycję?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmDiscard(false);
              }}
            >
              Wróć do edycji
            </Button>
            <Button
              onClick={() => {
                setConfirmDiscard(false);
                onOpenChange(false);
              }}
            >
              Odrzuć zmiany
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
