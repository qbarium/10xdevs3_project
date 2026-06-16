// Czysta logika filtra typu dla widoków zaakceptowanych (S-05). Wydzielona z islandu
// AcceptedItemsView, by była testowalna w środowisku node (bez DOM) — analogicznie do selection.ts
// i operational-view.ts. Filtr jest KLIENCKI (decyzja #1): derywuje listę z już załadowanych itemów,
// bez zapytań i bez query-paramów.

import { ITEM_TYPES } from "@/lib/ai/schema";
import type { Item } from "@/types";

/**
 * Wartości filtra typu: „wszystkie" + 5 typów `ItemType`. Wyprowadzone z kanonicznego `ITEM_TYPES`
 * (jedno źródło prawdy — dodanie typu w schemacie automatycznie poszerza filtr). Kolejność = kolejność
 * przycisków UI: „Wszystkie" pierwsze, dalej typy w kolejności `ITEM_TYPES`.
 */
export const TYPE_FILTER_VALUES = ["all", ...ITEM_TYPES] as const;
export type TypeFilterValue = (typeof TYPE_FILTER_VALUES)[number];

/**
 * Itemy spełniające filtr: `all` przepuszcza wszystko, w innym wypadku zostają itemy danego typu.
 * `pinnedIds` to świadomy wyłom (decyzja #6): item przypięty (np. po edycji zmieniającej typ przy
 * aktywnym filtrze) ZOSTAJE widoczny mimo niezgodności z filtrem — do najbliższego przełączenia
 * filtra / odświeżenia. Czysta funkcja: nie mutuje wejścia, zwraca nową tablicę.
 */
export function applyTypeFilter(
  items: readonly Item[],
  filter: TypeFilterValue,
  pinnedIds: ReadonlySet<string>,
): Item[] {
  return items.filter((item) => filter === "all" || item.type === filter || pinnedIds.has(item.id));
}

/**
 * Persystencja filtra przez COOKIE (nie URL — decyzja #1), per widok (niezależne filtry). Cookie jest
 * czytelne SERWEROWO, więc SSR renderuje od razu poprawnie przefiltrowaną listę — bez przeskoku po
 * hydracji (inaczej niż sessionStorage, niewidoczny dla serwera). Nazwa per widok izoluje filtry.
 */
export function typeFilterCookieName(view: string): string {
  return `tl_tf_${view}`;
}

/** Waliduje surową wartość (z cookie / dowolnego źródła) → poprawny `TypeFilterValue` lub fallback "all". */
export function parseTypeFilter(value: string | undefined | null): TypeFilterValue {
  return value != null && (TYPE_FILTER_VALUES as readonly string[]).includes(value)
    ? (value as TypeFilterValue)
    : "all";
}
