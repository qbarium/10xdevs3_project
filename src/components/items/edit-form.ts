// Czysta logika formularza edycji pendingu (walidacja + budowa payloadu), wydzielona z
// EditItemDialog do testowania w node (bez DOM). Spójna z `editItemSchema` po stronie serwera:
// title trim + reject pusty; description pusty/whitespace → null.

import type { EditItemInput } from "@/lib/validation/items";
import type { ItemType, OperationalStatus } from "@/types";

/** Title wymagany (po przycięciu białych znaków). */
export function isTitleValid(title: string): boolean {
  return title.trim() !== "";
}

/**
 * Buduje payload edycji: title trim, description pusty/whitespace → null, type i operationalStatus
 * bez zmian. `operationalStatus` przekazujemy JAWNIE (UI prefilluje bieżącą wartość) — edycja samej
 * treści wysyła niezmieniony stan, więc go zachowuje.
 */
export function buildEditPayload(
  title: string,
  description: string,
  type: ItemType,
  operationalStatus: OperationalStatus,
): EditItemInput {
  const trimmedDescription = description.trim();
  return {
    title: title.trim(),
    description: trimmedDescription === "" ? null : trimmedDescription,
    type,
    operationalStatus,
  };
}
