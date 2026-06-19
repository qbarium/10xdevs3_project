// Czysta logika formularza tworzenia itemu ręcznego (S-07), wydzielona z AddItemDialog do testów w node
// (bez DOM) — analogicznie do edit-form.ts. Spójna z `createItemSchema` po stronie serwera: title trim +
// reject pusty (gate `isTitleValid` reużywany przez dialog z edit-form.ts), description pusty/whitespace →
// null. Dodatkowo: pamięć „ostatnio użytego typu" (localStorage) oraz czysty reducer insert+pin dla
// optimistic insert nowego itemu w islandzie Aktywne.

import type { TypeFilterValue } from "@/components/items/type-filter";
import { ITEM_TYPES } from "@/lib/ai/schema";
import type { CreateItemInput } from "@/lib/validation/items";
import type { ItemType } from "@/types";

/** Klucz localStorage pod „ostatnio użyty typ" (prefiks `tl_`, jak `tl_typefilter`). */
const LAST_ITEM_TYPE_KEY = "tl_lastitemtype";

/** Domyślny typ, gdy brak lub nieprawidłowa wartość zapamiętana. */
const DEFAULT_ITEM_TYPE: ItemType = "task";

/**
 * Buduje payload tworzenia: title trim, description pusty/whitespace → null, type bez zmian. Lustro
 * `buildEditPayload` i `createItemSchema`; serwer i tak normalizuje ponownie, ale wysyłamy czyste wejście.
 */
export function buildCreatePayload(title: string, description: string, type: ItemType): CreateItemInput {
  const trimmedDescription = description.trim();
  return {
    title: title.trim(),
    description: trimmedDescription === "" ? null : trimmedDescription,
    type,
  };
}

/**
 * Odczyt „ostatnio użytego typu" z localStorage, walidowany względem `ITEM_TYPES` (jedno źródło prawdy —
 * dodanie typu w schemacie automatycznie go dopuszcza). Nieznana/uszkodzona wartość → fallback `'task'`.
 * try/catch jest defensywny: localStorage bywa niedostępny (SSR podczas hydracji wyspy, tryb prywatny).
 */
export function readLastItemType(): ItemType {
  try {
    const raw = localStorage.getItem(LAST_ITEM_TYPE_KEY);
    return raw != null && (ITEM_TYPES as readonly string[]).includes(raw) ? (raw as ItemType) : DEFAULT_ITEM_TYPE;
  } catch {
    return DEFAULT_ITEM_TYPE;
  }
}

/** Zapis „ostatnio użytego typu" — best-effort (błąd localStorage nie blokuje tworzenia). */
export function writeLastItemType(type: ItemType): void {
  try {
    localStorage.setItem(LAST_ITEM_TYPE_KEY, type);
  } catch {
    // best-effort — brak dostępu do pamięci nie jest błędem krytycznym
  }
}

/**
 * Decyzja o filtrze po utworzeniu itemu (S-07, decyzja użytkownika 2026-06-19): nowy item ma być widoczny
 * w SWOIM widoku. Gdy aktywny jest konkretny filtr INNEGO typu — zwróć typ itemu (island przełączy filtr,
 * item naturalnie wejdzie do listy, bez przypinania do obcego filtra). Gdy filtr to „all" albo już zgodny —
 * zwróć bieżący (item i tak jest widoczny; nie zawężamy „all" do jednego typu). Czysta funkcja.
 *
 * UWAGA: dotyczy WYŁĄCZNIE tworzenia. Edycja zmieniająca typ zachowuje dotychczasowe przypięcie (decyzja #6,
 * `pinnedIds` w handleSaved) — item zostaje widoczny tam, gdzie był, zamiast przeskakiwać widok.
 */
export function nextFilterAfterCreate(current: TypeFilterValue, itemType: ItemType): TypeFilterValue {
  return current !== "all" && current !== itemType ? itemType : current;
}

/**
 * Domyślny typ w dialogu dodawania (S-07, decyzja użytkownika 2026-06-19): na KONKRETNYM filtrze typu —
 * ten typ (dodajesz zwykle to, na co patrzysz, więc item pasuje bez przeskoku filtra); na „all" — ostatnio
 * użyty typ (`readLastItemType`). `TypeFilterValue` poza „all" JEST `ItemType`, więc zwracamy go wprost.
 */
export function defaultCreateType(filter: TypeFilterValue): ItemType {
  return filter === "all" ? readLastItemType() : filter;
}
