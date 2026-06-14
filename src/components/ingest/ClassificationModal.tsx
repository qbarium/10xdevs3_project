// Blokujący modal czterech stanów przebiegu klasyfikacji (US-01 / FR-006). W stanie `processing`
// odbiera użytkownikowi WSZYSTKIE drogi zamknięcia (Escape, klik poza, przycisk X) — to świadoma
// blokada interakcji, nie zwykły modal. Stany końcowe pozwalają zamknąć/ponowić. Po sukcesie z
// itemami auto-przejście do /items (z licznikiem) + przycisk natychmiastowy.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ClassificationState } from "@/components/hooks/useClassification";
import { ingestErrorMessage } from "@/lib/ingest-errors";
import { entryNoun } from "@/lib/labels";

interface Props {
  state: ClassificationState;
  itemCount: number;
  errorCode: string | null;
  onRetry: () => void;
  onClose: () => void;
}

const AUTO_REDIRECT_SECONDS = 4;
const ITEMS_PATH = "/items";

// Komunikat błędu wg kodu pochodzi ze współdzielonego ingestErrorMessage (S-08); entryNoun z labels.ts.

function goToItems(): void {
  window.location.href = ITEMS_PATH;
}

/**
 * Odlicza do auto-przejścia na /items. Wydzielony komponent: renderowany wyłącznie w stanie sukcesu,
 * więc montuje się świeżo i `useState(AUTO_REDIRECT_SECONDS)` startuje od nowa — bez resetu setState
 * w efekcie. Efekt tylko zakłada interwał (tick przez setState w callbacku jest dozwolony).
 */
function RedirectCountdown() {
  const [countdown, setCountdown] = useState(AUTO_REDIRECT_SECONDS);
  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id);
          goToItems();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, []);
  return <DialogDescription>Przenosimy Cię do walidacji za {countdown} s…</DialogDescription>;
}

export function ClassificationModal({ state, itemCount, errorCode, onRetry, onClose }: Props) {
  const open = state !== "idle";
  const isProcessing = state === "processing";

  function handleOpenChange(next: boolean): void {
    // Zamknięcie dozwolone wyłącznie w stanach końcowych; `processing` blokuje (patrz preventDefault niżej).
    if (!next && !isProcessing) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!isProcessing}
        onEscapeKeyDown={(e) => {
          if (isProcessing) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (isProcessing) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (isProcessing) e.preventDefault();
        }}
      >
        {state === "processing" && (
          <>
            <DialogHeader>
              <DialogTitle>Analizujemy wsad…</DialogTitle>
              <DialogDescription>
                Klasyfikujemy Twój tekst. To może chwilę potrwać — nie zamykaj okna.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-4">
              <Loader2 className="size-8 animate-spin text-purple-400" />
            </div>
          </>
        )}

        {state === "completed_with_items" && (
          <>
            <DialogHeader>
              <DialogTitle>
                Sesja zawiera {itemCount} {entryNoun(itemCount)}
              </DialogTitle>
              <RedirectCountdown />
            </DialogHeader>
            <DialogFooter>
              <Button type="button" onClick={goToItems}>
                Przejdź do walidacji teraz
              </Button>
            </DialogFooter>
          </>
        )}

        {state === "completed_no_items" && (
          <>
            <DialogHeader>
              <DialogTitle>Nie znaleziono wpisów</DialogTitle>
              <DialogDescription>
                Wsad nie zawierał treści do sklasyfikowania. Spróbuj z innym tekstem.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Zamknij
              </Button>
            </DialogFooter>
          </>
        )}

        {state === "failed" && (
          <>
            <DialogHeader>
              <DialogTitle>Klasyfikacja nie powiodła się</DialogTitle>
              <DialogDescription>{ingestErrorMessage(errorCode)}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" onClick={onRetry}>
                Spróbuj ponownie
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
