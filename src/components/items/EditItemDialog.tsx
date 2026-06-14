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
import { itemTypeLabel } from "@/lib/labels";
import type { Item, ItemType } from "@/types";

interface Props {
  item: Item;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sukces zapisu — wołane z zaktualizowanym itemem (podmiana w stanie islandu, item zostaje pending). */
  onSaved: (updated: Item) => void;
  /** 404 (item nie jest już pending) — wołane, by usunąć item z listy islandu (poprawka F2). */
  onNotFound: (id: string) => void;
}

// Modal edycji pendingu (title/description/typ). Zapis natychmiastowy — item zostaje `pending`,
// akceptacja to osobna akcja (FR-010). Derywację operational_status z typu robi serwer (Faza 1).
// Zamknięcie z niezapisanymi zmianami jest bramkowane pytaniem (ochrona przed utratą danych).
export default function EditItemDialog({ item, open, onOpenChange, onSaved, onNotFound }: Props) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [type, setType] = useState<ItemType>(item.type);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const { editItem, pending } = useItemMutation();

  // Pola inicjalizowane z propsów; reset przy zmianie itemu zapewnia remount przez `key={item.id}`.
  const titleInvalid = !isTitleValid(title);
  const isDirty = title !== item.title || description !== (item.description ?? "") || type !== item.type;

  async function handleSave(): Promise<void> {
    if (titleInvalid) return;
    const result = await editItem(item.id, buildEditPayload(title, description, type));
    if (result.ok) {
      toast.success("Zapisano zmiany.");
      onSaved(result.item);
      onOpenChange(false);
    } else if (result.reason === "not_found") {
      toast.error("Element nie jest już dostępny do edycji.");
      onNotFound(item.id);
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
        <DialogContent className="max-h-[85vh] w-auto max-w-[95vw] overflow-auto sm:max-w-[95vw]">
          <DialogHeader>
            <DialogTitle>Edytuj element</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
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

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-description">Opis</Label>
              {/* field-sizing-fixed: bez auto-rozrostu przy Enterze; scroll w kontrolce + uchwyt `resize`
                  w OBU osiach. Domyślne wymiary (w-[32rem] / min-h-28) to minimum; max 90vw / 65vh.
                  Okno (w-auto) rośnie wraz z polem w pionie i w poziomie. */}
              <Textarea
                id="edit-description"
                value={description}
                className="field-sizing-fixed max-h-[65vh] min-h-28 w-[32rem] max-w-[90vw] min-w-[16rem] resize overflow-auto"
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
          </div>

          <DialogFooter>
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
