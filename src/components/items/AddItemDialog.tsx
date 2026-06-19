import { useState } from "react";
import { toast } from "sonner";

import { useItemMutation } from "@/components/hooks/useItemMutation";
import { buildCreatePayload, writeLastItemType } from "@/components/items/create-form";
import { isTitleValid } from "@/components/items/edit-form";
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
  open: boolean;
  /** Domyślny typ przy otwarciu: typ aktywnego filtra, a na „Wszystkie" — ostatnio użyty (liczone w islandzie). */
  defaultType: ItemType;
  onOpenChange: (open: boolean) => void;
  /** Sukces utworzenia — wołane z nowym itemem; island wstawia go, ew. przełącza filtr na jego typ i fokusuje. */
  onCreated: (item: Item) => void;
}

// Modal dodawania itemu RĘCZNEGO (S-07): typ / title / description. BEZ selektora stanu operacyjnego —
// serwer ustala `new` (niezmiennik po stronie serwera, nie wybór usera). Reużywa wzorzec EditItemDialog:
// gate `isTitleValid` na „Dodaj", toast potwierdzenia, bramka „niezapisane zmiany" przy zamknięciu z
// niepustymi polami. Domyślny typ przychodzi propsem `defaultType` (typ filtra / ostatnio użyty na „all").
// Po zapisie zamyka się — świadomie BRAK „dodaj kolejny" (jeden item na otwarcie). Rodzic montuje warunkowo
// (świeży mount = zerowanie pól + ponowne wzięcie `defaultType` dla bieżącego filtra).
export default function AddItemDialog({ open, defaultType, onOpenChange, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ItemType>(defaultType);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const { createItem, pending } = useItemMutation();

  const titleInvalid = !isTitleValid(title);
  const isDirty = title.trim() !== "" || description.trim() !== "";

  async function handleSave(): Promise<void> {
    if (titleInvalid) return;
    const result = await createItem(buildCreatePayload(title, description, type));
    if (result.ok) {
      writeLastItemType(type); // zapamiętaj wybór tylko po udanym zapisie
      toast.success("Dodano element.");
      onCreated(result.item);
      onOpenChange(false);
    } else {
      toast.error("Nie udało się dodać elementu. Spróbuj ponownie.");
    }
  }

  // Każda ścieżka zamknięcia (klik poza, Esc, X, Anuluj) przechodzi tędy: przy niepustych polach pytamy
  // zamiast zamykać; bez treści zamykamy od razu.
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
        <DialogContent className="max-h-[85vh] w-auto max-w-[95vw] overflow-auto sm:max-w-[95vw]">
          <DialogHeader>
            <DialogTitle>Dodaj element</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="add-title">Tytuł</Label>
              <Input
                id="add-title"
                value={title}
                aria-invalid={titleInvalid}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
              />
              {titleInvalid && <p className="text-destructive text-sm">Tytuł jest wymagany.</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="add-description">Opis</Label>
              <Textarea
                id="add-description"
                value={description}
                className="field-sizing-fixed max-h-[65vh] min-h-28 w-[32rem] max-w-[90vw] min-w-[16rem] resize overflow-auto"
                onChange={(event) => {
                  setDescription(event.target.value);
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="add-type">Typ</Label>
              <Select
                value={type}
                onValueChange={(value) => {
                  setType(value as ItemType);
                }}
              >
                <SelectTrigger id="add-type">
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
              Dodaj
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
            <DialogDescription>Masz niezapisane zmiany. Odrzucić je i zamknąć?</DialogDescription>
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
