// Wyspa akcji głównej w topbarze powłoki (S-15 Faza 3). Klik rozgłasza intencję zdarzeniem `tl:item-action`;
// wyspa widoku (`useItemTopbarBridge`) otwiera odpowiedni dialog/potwierdzenie. Akcja per widok:
// „Dodaj wpis" (Aktywne) i „Wyczyść kosz" (Kosz — destrukcyjna, potwierdzana w wyspie).

import { Plus, Trash2, type LucideIcon } from "lucide-react";

import { dispatchItemAction, type ItemPrimaryAction } from "@/components/items/item-topbar-events";
import { Button } from "@/components/ui/button";

const CONFIG: Record<ItemPrimaryAction, { label: string; icon: LucideIcon; variant: "default" | "destructive" }> = {
  add: { label: "Dodaj wpis", icon: Plus, variant: "default" },
  "empty-trash": { label: "Wyczyść kosz", icon: Trash2, variant: "destructive" },
};

export default function TopbarItemAction({ action }: { action: ItemPrimaryAction }) {
  const config = CONFIG[action];
  const Icon = config.icon;
  return (
    <Button
      type="button"
      size="sm"
      variant={config.variant}
      onClick={() => {
        dispatchItemAction(action);
      }}
    >
      <Icon className="size-4" />
      {config.label}
    </Button>
  );
}
