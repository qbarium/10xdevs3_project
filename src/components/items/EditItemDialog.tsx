import { useState } from "react";
import { toast } from "sonner";

import { useItemMutation } from "@/components/hooks/useItemMutation";
import { buildEditPayload, isTitleValid } from "@/components/items/edit-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
export default function EditItemDialog({ item, open, onOpenChange, onSaved, onNotFound }: Props) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [type, setType] = useState<ItemType>(item.type);
  const { editItem, pending } = useItemMutation();

  // Pola inicjalizowane z propsów. Reset przy zmianie itemu zapewnia remount przez `key={item.id}`
  // w rodzicu (PendingItemsView) — idiomatyczny React zamiast setState w useEffect.
  const titleInvalid = !isTitleValid(title);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
            <Textarea
              id="edit-description"
              value={description}
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
              onOpenChange(false);
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
  );
}
